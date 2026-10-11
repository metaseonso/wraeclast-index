/* Whether anything should move, asked once (docs/framework.md "Motion"). Two things say no: the player, through the
   browser (prefers-reduced-motion), and the machine, through html.lite, which index.html sets before the first paint
   for a weak phone, a saver connection or that same preference. A module that animates asks calm() before it starts
   and listens to `still` for the player changing their mind; it never reads matchMedia or the lite class itself.
   Imports nothing. */
export const still = matchMedia('(prefers-reduced-motion: reduce)');
export const lite = document.documentElement.classList.contains('lite');
export const calm = () => still.matches || lite;
