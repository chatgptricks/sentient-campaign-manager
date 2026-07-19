import { fireEvent, render, screen } from '@testing-library/react';
import { format, startOfToday } from 'date-fns';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CalendarPanel } from './CalendarPanel';

describe('CalendarPanel', () => {
  it('selects a day and carries that date into the add-promotion link', () => {
    const today = startOfToday();
    const date = format(today, 'yyyy-MM-dd');

    render(
      <MemoryRouter>
        <CalendarPanel
          title="Posting calendar"
          description="Posting schedule"
          accent="posting"
          events={[
            {
              id: 'promotion-1',
              date,
              title: 'Summer rooftop launch',
              subtitle: 'Arcadia Hotels',
              status: 'PUBLISHER_ASSIGNED',
              href: '/promotions/promotion-1',
            },
          ]}
          addHrefForDate={(selectedDate) => `/promotions/new?dueDate=${selectedDate}`}
        />
      </MemoryRouter>,
    );

    const day = screen.getByRole('button', { name: `Select ${format(today, 'MMMM d, yyyy')}` });
    fireEvent.click(day);

    expect(screen.getAllByText('Summer rooftop launch')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Add promotion' })).toHaveAttribute(
      'href',
      `/promotions/new?dueDate=${date}`,
    );
  });

  it('opens date actions from the custom right-click menu', () => {
    const today = startOfToday();

    render(
      <MemoryRouter>
        <CalendarPanel
          title="Posting calendar"
          description="Posting schedule"
          accent="posting"
          events={[]}
          addHrefForDate={(selectedDate) => `/promotions/new?dueDate=${selectedDate}`}
        />
      </MemoryRouter>,
    );

    const day = screen.getByRole('button', { name: `Select ${format(today, 'MMMM d, yyyy')}` });
    fireEvent.contextMenu(day);

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Add promotion on/i })).toBeInTheDocument();
  });
});
