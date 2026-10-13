import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SourceIcon } from './connectionSources'
import { providerArtwork } from './providerArtwork'

for (const type of ['prometheus', 'loki', 'tempo'] as const) {
  test(`${type} renders local monochrome provider artwork`, () => {
    const { container } = render(<SourceIcon type={type} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-provider-logo')).toBe(type)
    expect(svg.getAttribute('viewBox')).toBe(providerArtwork[type].viewBox)
    expect(svg.getAttribute('fill')).toBe('currentColor')
    expect(svg.getAttribute('stroke')).toBe('none')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(
      providerArtwork[type].paths[0],
    )
    if (type === 'loki')
      expect(svg.querySelectorAll('polygon')).toHaveLength(15)
    expect(svg.querySelector('image, use')).toBeNull()
  })
}
