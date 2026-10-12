import './styles.css'

const copyButton = document.querySelector<HTMLButtonElement>(
  '[data-copy-install]',
)
const copyStatus = document.querySelector<HTMLElement>(
  '[data-copy-install-status]',
)
const installCode = document.querySelector<HTMLElement>('.start .terminal code')

if (copyButton && copyStatus && installCode) {
  let resetTimeout: number | undefined

  copyButton.addEventListener('click', async () => {
    // Prompts are CSS-generated rather than DOM text, so copied commands
    // never include '$' even when someone manually selects the snippet.
    const commands = (installCode.textContent ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')

    try {
      await navigator.clipboard.writeText(commands)
      copyButton.dataset.copied = 'true'
      copyButton.setAttribute('aria-label', 'Installation commands copied')
      copyButton.title = 'Copied!'
      copyStatus.textContent = 'Installation commands copied to clipboard.'
    } catch {
      delete copyButton.dataset.copied
      copyButton.title = 'Copy unavailable — select the commands manually'
      copyStatus.textContent =
        'Copy unavailable. Select the installation commands manually.'
    }

    if (resetTimeout !== undefined) window.clearTimeout(resetTimeout)
    resetTimeout = window.setTimeout(() => {
      delete copyButton.dataset.copied
      copyButton.setAttribute('aria-label', 'Copy installation commands')
      copyButton.title = 'Copy installation commands'
      copyStatus.textContent = ''
    }, 2000)
  })
}
