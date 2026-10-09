import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, Input, Select } from './Field';

describe('Field (#14)', () => {
  it('links its label to the control automatically', () => {
    render(
      <>
        <Field label="Name">
          <Input />
        </Field>
        <Field label="Mode">
          <Select>
            <option>CASH</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText('Name').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Mode').tagName).toBe('SELECT');
  });

  it('keeps an explicit id', () => {
    render(
      <Field label="Email" htmlFor="email">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email');
  });
});
