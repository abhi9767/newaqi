@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; }
body { @apply bg-slate-50 text-slate-900 antialiased; }
.leaflet-container { font: inherit; }
:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
