/** Area name banner + controls help. Plain DOM, styled in index.html. */
export class Hud {
  private zone = document.getElementById('zone')!;
  private last = '';

  setArea(label: string | undefined): void {
    const text = label ?? '';
    if (text === this.last) return;
    this.last = text;
    this.zone.textContent = text;
    this.zone.classList.remove('show');
    void this.zone.offsetWidth; // restart the fade animation
    if (text) this.zone.classList.add('show');
  }
}
