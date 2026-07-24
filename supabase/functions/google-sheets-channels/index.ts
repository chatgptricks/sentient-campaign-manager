import { authenticateUser, hasRole } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, assertUuid, databaseError, HttpError } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { serve } from '../_shared/runtime.ts';
import {
  GoogleSheetsClient,
  parseGoogleSheetUrl,
  parseSheetChannelRows,
  sheetRowValuesForHeaders,
  sheetTitleFor,
  type SheetChannelItemInput,
} from '../_shared/services/google-sheets.ts';

type SyncBody = {
  action: 'sync';
  promotionId?: string;
  promotion_id?: string;
  sheetUrl?: string;
  sheet_url?: string;
};

type UpdateItemBody = {
  action: 'update_item';
  item?: Partial<SheetChannelItemInput>;
  itemId?: string;
  item_id?: string;
};

type AppendItemBody = {
  action: 'append_item';
  item?: Partial<SheetChannelItemInput>;
  promotionId?: string;
  promotion_id?: string;
};

type RequestBody = SyncBody | UpdateItemBody | AppendItemBody;

function serviceClient() {
  return createServiceClient();
}

function cellName(columnIndex: number, rowNumber: number) {
  let value = columnIndex + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return `${label}${rowNumber}`;
}

async function requireCanManagePromotion(request: Request, promotionId: string) {
  const client = serviceClient();
  const auth = await authenticateUser(request, client);
  const { data: promotion, error } = await client
    .from('promotions')
    .select('sales_owner_id')
    .eq('id', promotionId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Promotion access could not be checked.');
  if (!promotion) throw new HttpError(404, 'PROMOTION_NOT_FOUND', 'Promotion was not found.');
  if (!hasRole(auth, 'ADMINISTRATOR') && promotion.sales_owner_id !== auth.user.id) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Only the Sales owner or an Administrator can edit the Sheet checklist.',
    );
  }
  return auth;
}

function normalizeItem(input: Partial<SheetChannelItemInput> | undefined): SheetChannelItemInput {
  if (!input) throw new HttpError(400, 'SHEET_ITEM_REQUIRED', 'Sheet row data is required.');
  const platform = String(input.platform ?? '')
    .trim()
    .toUpperCase();
  const ownershipType = String(input.ownershipType ?? 'SENTIENT_OWNED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (!['INSTAGRAM', 'X', 'LINKEDIN'].includes(platform)) {
    throw new HttpError(400, 'SHEET_PLATFORM_INVALID', 'Choose Instagram, X, or LinkedIn.');
  }
  if (!['SENTIENT_OWNED', 'CLIENT_OWNED', 'EXTERNAL_PARTNER'].includes(ownershipType)) {
    throw new HttpError(400, 'SHEET_OWNERSHIP_INVALID', 'Choose a valid ownership type.');
  }
  const accountName = String(input.accountName ?? '').trim();
  const handle = String(input.handle ?? '').trim();
  const accountUrl = String(input.accountUrl ?? '').trim();
  if (!accountName || !handle || !accountUrl) {
    throw new HttpError(400, 'SHEET_ITEM_INVALID', 'Account name, handle, and URL are required.');
  }
  try {
    const url = new URL(accountUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid');
  } catch {
    throw new HttpError(400, 'SHEET_ACCOUNT_URL_INVALID', 'Account URL must be a valid link.');
  }
  return {
    accountName,
    accountUrl,
    active: input.active !== false,
    handle,
    notes: String(input.notes ?? '').trim(),
    ownershipType: ownershipType as SheetChannelItemInput['ownershipType'],
    partnerName: String(input.partnerName ?? '').trim(),
    platform: platform as SheetChannelItemInput['platform'],
  };
}

async function syncSheet(request: Request, body: SyncBody) {
  const promotionId = body.promotionId ?? body.promotion_id;
  assertUuid(promotionId, 'promotionId');
  const auth = await requireCanManagePromotion(request, promotionId);
  const sheetUrl = body.sheetUrl ?? body.sheet_url;
  if (!sheetUrl) throw new HttpError(400, 'SHEET_URL_REQUIRED', 'Paste a Google Sheet link.');
  const parsed = parseGoogleSheetUrl(sheetUrl);
  const client = serviceClient();
  const sheets = new GoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheet(parsed.spreadsheetId);
  const sheetName = sheetTitleFor(spreadsheet, parsed.gid);
  const values = await sheets.values(parsed.spreadsheetId, `'${sheetName}'!A:Z`);
  const parsedRows = parseSheetChannelRows(values.values ?? []);

  const idColumn = parsedRows.indexes.get('crm_item_id');
  if (idColumn === undefined) {
    throw new HttpError(400, 'SHEET_HEADERS_INVALID', 'Missing crm_item_id column.');
  }
  for (const missing of parsedRows.missingIds) {
    await sheets.updateValues(
      parsed.spreadsheetId,
      `'${sheetName}'!${cellName(idColumn, missing.rowNumber)}`,
      [[missing.value]],
    );
  }

  const { data: sheet, error: sheetError } = await client
    .from('promotion_channel_sheets')
    .upsert(
      {
        created_by: auth.user.id,
        header_row: 1,
        last_synced_at: new Date().toISOString(),
        last_synced_by: auth.user.id,
        promotion_id: promotionId,
        sheet_gid: parsed.gid ?? null,
        sheet_name: sheetName,
        sheet_url: sheetUrl,
        spreadsheet_id: parsed.spreadsheetId,
      },
      { onConflict: 'promotion_id' },
    )
    .select('*')
    .single();
  if (sheetError) throw databaseError(sheetError, 'Sheet checklist could not be saved.');

  const incomingIds = new Set(parsedRows.items.map((item) => item.crmItemId));
  for (const item of parsedRows.items) {
    const { error } = await client.from('promotion_channel_sheet_items').upsert(
      {
        account_name: item.accountName,
        account_url: item.accountUrl,
        active: item.active,
        crm_item_id: item.crmItemId,
        handle: item.handle,
        notes: item.notes || null,
        ownership_type: item.ownershipType,
        partner_name: item.partnerName || null,
        platform: item.platform,
        raw_json: item.raw,
        row_number: item.rowNumber,
        sheet_id: sheet.id,
      },
      { onConflict: 'sheet_id,crm_item_id' },
    );
    if (error) throw databaseError(error, 'Sheet row could not be saved.');
  }

  const { data: existingRows, error: existingError } = await client
    .from('promotion_channel_sheet_items')
    .select('id,crm_item_id')
    .eq('sheet_id', sheet.id);
  if (existingError) throw databaseError(existingError, 'Existing Sheet rows could not be loaded.');
  const removedIds = (existingRows ?? [])
    .filter((row) => !incomingIds.has(String(row.crm_item_id)))
    .map((row) => String(row.id));
  if (removedIds.length) {
    const { error: deactivateError } = await client
      .from('promotion_channel_sheet_items')
      .update({ active: false })
      .in('id', removedIds);
    if (deactivateError)
      throw databaseError(deactivateError, 'Removed Sheet rows could not be reconciled.');
  }

  const { data: items, error: itemError } = await client
    .from('promotion_channel_sheet_items')
    .select('*')
    .eq('sheet_id', sheet.id)
    .order('row_number');
  if (itemError) throw databaseError(itemError, 'Sheet rows could not be loaded.');
  return { items: items ?? [], sheet };
}

async function updateItem(request: Request, body: UpdateItemBody) {
  const itemId = body.itemId ?? body.item_id;
  assertUuid(itemId, 'itemId');
  const client = serviceClient();
  const { data: existing, error } = await client
    .from('promotion_channel_sheet_items')
    .select('*, sheet:promotion_channel_sheets(*)')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Sheet row could not be loaded.');
  if (!existing) throw new HttpError(404, 'SHEET_ITEM_NOT_FOUND', 'Sheet row was not found.');
  const sheet = Array.isArray(existing.sheet) ? existing.sheet[0] : existing.sheet;
  await requireCanManagePromotion(request, sheet.promotion_id);

  const current = {
    accountName: existing.account_name,
    accountUrl: existing.account_url,
    active: existing.active,
    handle: existing.handle,
    notes: existing.notes ?? '',
    ownershipType: existing.ownership_type,
    partnerName: existing.partner_name ?? '',
    platform: existing.platform,
  };
  const next = normalizeItem({ ...current, ...body.item });
  const sheets = new GoogleSheetsClient();
  const values = await sheets.values(sheet.spreadsheet_id, `'${sheet.sheet_name}'!A:Z`);
  const parsedRows = parseSheetChannelRows(values.values ?? []);
  await sheets.updateValues(
    sheet.spreadsheet_id,
    `'${sheet.sheet_name}'!A${existing.row_number}:${cellName(parsedRows.headers.length - 1, existing.row_number)}`,
    [
      sheetRowValuesForHeaders(parsedRows.headers, parsedRows.indexes, {
        ...next,
        crmItemId: existing.crm_item_id,
      }),
    ],
  );

  const { data: updated, error: updateError } = await client
    .from('promotion_channel_sheet_items')
    .update({
      account_name: next.accountName,
      account_url: next.accountUrl,
      active: next.active,
      handle: next.handle,
      notes: next.notes || null,
      ownership_type: next.ownershipType,
      partner_name: next.partnerName || null,
      platform: next.platform,
      raw_json: { ...existing.raw_json, ...next },
    })
    .eq('id', itemId)
    .select('*')
    .single();
  if (updateError) throw databaseError(updateError, 'Sheet row could not be saved.');
  return { item: updated };
}

async function appendItem(request: Request, body: AppendItemBody) {
  const promotionId = body.promotionId ?? body.promotion_id;
  assertUuid(promotionId, 'promotionId');
  await requireCanManagePromotion(request, promotionId);
  const client = serviceClient();
  const next = normalizeItem(body.item);
  const { data: sheet, error } = await client
    .from('promotion_channel_sheets')
    .select('*')
    .eq('promotion_id', promotionId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Sheet checklist could not be loaded.');
  if (!sheet) throw new HttpError(404, 'SHEET_NOT_CONNECTED', 'Connect a Google Sheet first.');

  const crmItemId = crypto.randomUUID();
  const sheets = new GoogleSheetsClient();
  const values = await sheets.values(sheet.spreadsheet_id, `'${sheet.sheet_name}'!A:Z`);
  const parsedBeforeAppend = parseSheetChannelRows(values.values ?? []);
  await sheets.appendValues(sheet.spreadsheet_id, `'${sheet.sheet_name}'!A:Z`, [
    sheetRowValuesForHeaders(parsedBeforeAppend.headers, parsedBeforeAppend.indexes, {
      ...next,
      crmItemId,
    }),
  ]);

  const refreshed = await sheets.values(sheet.spreadsheet_id, `'${sheet.sheet_name}'!A:Z`);
  const parsedRows = parseSheetChannelRows(refreshed.values ?? []);
  const appended = parsedRows.items.find((item) => item.crmItemId === crmItemId);
  if (!appended)
    throw new HttpError(
      502,
      'SHEET_APPEND_NOT_VISIBLE',
      'The appended Sheet row could not be read back.',
    );

  const { data: item, error: insertError } = await client
    .from('promotion_channel_sheet_items')
    .upsert(
      {
        account_name: appended.accountName,
        account_url: appended.accountUrl,
        active: appended.active,
        crm_item_id: appended.crmItemId,
        handle: appended.handle,
        notes: appended.notes || null,
        ownership_type: appended.ownershipType,
        partner_name: appended.partnerName || null,
        platform: appended.platform,
        raw_json: appended.raw,
        row_number: appended.rowNumber,
        sheet_id: sheet.id,
      },
      { onConflict: 'sheet_id,crm_item_id' },
    )
    .select('*')
    .single();
  if (insertError) throw databaseError(insertError, 'Sheet row could not be saved.');
  return { item };
}

export const handleRequest = functionHandler('google-sheets-channels', async (request) => {
  assertMethod(request);
  const body = await readJson<RequestBody>(request);
  if (body.action === 'sync') return jsonResponse(request, await syncSheet(request, body));
  if (body.action === 'update_item') return jsonResponse(request, await updateItem(request, body));
  if (body.action === 'append_item') return jsonResponse(request, await appendItem(request, body));
  throw new HttpError(400, 'ACTION_INVALID', 'Choose a supported Sheet action.');
});

serve(handleRequest);
