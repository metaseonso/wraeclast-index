/* The two widths the site is laid out at, in one place (docs/framework.md "Responsive"). A sheet writes the same two
   numbers in its @media lines (640 and 1279: tools/dev/arch.mjs holds every @media to them); a module reads them here
   and never writes one of its own. Everything narrower than a component's own box is a container query, not a width.
   Imports nothing; costs nothing. */
export const SCREEN = {
  phone: 640,   // at most this wide: one column, the bar's sheet, the card's own sheets (assets/css/pages/bench.css)
  bar: 1279,    // at most this wide: the top bar folds its index into a sheet under the menu button (assets/css/components/)
};
/* a media query list for each, so a module can ask and listen */
export const phone = () => matchMedia('(max-width:' + SCREEN.phone + 'px)');
export const narrow = () => matchMedia('(max-width:' + SCREEN.bar + 'px)');
