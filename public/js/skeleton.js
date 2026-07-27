const Skeleton = {
  card(count = 1) {
    return Array(count).fill('').map(() => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-line h-6 w-75"></div>
        <div class="skeleton skeleton-line w-50" style="margin-top:8px"></div>
        <div class="skeleton skeleton-line w-full" style="margin-top:16px"></div>
        <div class="skeleton skeleton-line w-full"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <div class="skeleton skeleton-line" style="width:80px;height:32px;border-radius:var(--radius-sm)"></div>
          <div class="skeleton skeleton-line" style="width:80px;height:32px;border-radius:var(--radius-sm)"></div>
        </div>
      </div>
    `).join('');
  },

  list(count = 5) {
    return Array(count).fill('').map(() => `
      <div class="skeleton-row">
        <div class="skeleton skeleton-avatar"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-line w-75"></div>
          <div class="skeleton skeleton-line w-50"></div>
        </div>
        <div class="skeleton skeleton-line" style="width:60px;height:24px;border-radius:var(--radius-sm)"></div>
      </div>
    `).join('');
  },

  table(rows = 5, cols = 4) {
    return `
      <div style="border:1px solid var(--gray-200);border-radius:var(--radius);overflow:hidden">
        ${Array(rows).fill('').map(() => `
          <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;padding:16px 20px;border-bottom:1px solid var(--gray-100)">
            ${Array(cols).fill('').map((_, i) => `
              <div class="skeleton skeleton-line ${i === 0 ? 'w-75' : 'w-50'}"></div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  },

  stats(count = 4) {
    return Array(count).fill('').map(() => `
      <div class="skeleton-card" style="padding:20px">
        <div class="skeleton skeleton-line" style="width:40px;height:40px;border-radius:var(--radius-sm);margin-bottom:12px"></div>
        <div class="skeleton skeleton-line h-6 w-50"></div>
        <div class="skeleton skeleton-line w-75" style="margin-top:4px"></div>
      </div>
    `).join('');
  },

  showIn(container) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (container) container.innerHTML = this.card(3);
  }
};
