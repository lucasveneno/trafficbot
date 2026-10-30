import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Onboarding } from './Onboarding'
test('dismissing onboarding preserves hook order and persists dismissal', () => {
  const view = render(<Onboarding />)
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  expect(screen.queryByText('Welcome to Trafficbot')).not.toBeInTheDocument()
  expect(localStorage.getItem('trafficbot_onboarded')).toBe('1')
  view.rerender(<Onboarding />)
  expect(screen.queryByText('Welcome to Trafficbot')).not.toBeInTheDocument()
})
