"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Link from "next/link";
import { List } from "@phosphor-icons/react/dist/ssr";

import { contentColumnClasses } from "@/components/ui/layout";

// Referenced by both the toggle's `aria-controls` and the list's `id`, so the
// two cannot drift apart. MainNav is rendered once, in the root layout, so a
// constant is unique on the page.
const MENU_ID = "main-nav-menu";

// Which pages are in the nav, and in what order. Up here rather than inline in
// the list below, where it was 170 lines further down and behind three
// paragraphs about breakpoints and the accessibility tree.
const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/animation", label: "Animation" },
  { href: "/contact", label: "Contact" },
  { href: "/credits", label: "Credits" },
] as const;

const MainNav = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  // Returning focus is unconditional because the DOM already encodes the
  // condition: at and above the large breakpoint the toggle is not laid out, and
  // focusing an element that is not laid out is a no-op that leaves focus where
  // it was. So this restores focus exactly when the panel was an overlay, with
  // no media query to keep in sync.
  //
  // It has to run before the state change lands, not after. Once the list is no
  // longer laid out the browser drops focus to the body, which is the "dumped at
  // the top of the document" outcome this exists to prevent.
  const closeMenu = useCallback(() => {
    toggleRef.current?.focus();
    setIsOpen(false);
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  // A disclosure, not a dialog: no `role="dialog"`, no `aria-modal`, no focus
  // trap and nothing made inert. `aria-expanded` on the toggle already describes
  // this control truthfully, and the three attributes above would contradict it
  // by announcing a modal that the rest of the page is still reachable from.
  //
  // What overlaying does add is the two dismissals a panel floating over content
  // owes the reader: Escape, and a click that lands anywhere else.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    // The dismissing click normally keeps its hands off focus: the reader has
    // just pointed at something else, and pulling focus back to the toggle would
    // take it away from whatever they were reaching for.
    //
    // The exception is focus that is inside the panel, because hiding the panel
    // would drop it to the body and strand a keyboard reader at the top of the
    // document -- the same outcome Escape restores from.
    //
    // Restoring it takes a `preventDefault`, and only on the scrim. A press
    // clears focus as part of its own default action, which runs after this
    // listener and would undo the restore; suppressing that is free on the scrim,
    // which has nothing to focus and nothing to select, and is not done anywhere
    // else, so a press on a real control still focuses it.
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (toggleRef.current?.contains(target)) return;
      if (menuRef.current?.contains(document.activeElement)) {
        if (scrimRef.current?.contains(target)) event.preventDefault();
        closeMenu();
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, closeMenu]);

  // A `nav` rather than an `aside`: this is the site's primary navigation, so
  // the `complementary` landmark `aside` carries was simply wrong. This is the
  // page's only navigation landmark now that the top bar is a `banner`, so the
  // name is belt-and-braces rather than load-bearing: it keeps a future second
  // nav from arriving as an unnamed, indistinguishable one.
  return (
    <nav
      aria-label="Main"
      // Every width, colour and padding value that belongs to the desktop column
      // is now prefixed, and the unprefixed values below the breakpoint are the
      // overlay's. Each unprefixed declaration has a prefixed counterpart that
      // resets it -- `relative` against `lg:static`, `p-2` against `lg:p-4` -- so
      // the desktop column is not relying on the absence of a conflict. It is
      // relying on the variant winning the conflict, which it does because
      // variant and base utilities land in the same layer at the same specificity
      // and the variant is emitted second. Anything unprefixed added here without
      // a counterpart reaches desktop too.
      //
      // Below the breakpoint the landmark is a bare strip holding the toggle: no
      // background of its own, so it is indistinguishable from the page, and no
      // width floor, which is what used to force a horizontal scrollbar on a
      // viewport narrower than 250px. It is the positioning ancestor the panel
      // and the scrim are placed against, and it outranks the header so the panel
      // is not painted underneath it.
      className="relative z-40 p-2 text-foreground lg:static lg:z-auto lg:bg-surface lg:px-4 lg:py-2"
    >
      {/* A scrim, not a modal backdrop. It carries no role, no handler and no
          name, so it adds nothing to the accessibility tree -- the dismissing
          click is caught on the document, which works with or without it. It is
          here for two visual reasons. `--surface` sits at #27272a against a
          #18181b page, so an undimmed panel edge is nearly invisible over
          content; and it absorbs the dismissing click, which would otherwise
          activate whichever link or control happened to be underneath. */}
      {isOpen ? (
        <div
          ref={scrimRef}
          aria-hidden="true"
          className="fixed inset-0 bg-black/60 lg:hidden"
        />
      ) : null}
      <button
        ref={toggleRef}
        type="button"
        // `aria-expanded` tracks `isOpen`, which is the whole truth only below
        // the large breakpoint. At and above it the list is always laid out and
        // this toggle is dropped from the layout -- and an element dropped that
        // way is absent from the accessibility tree, so this attribute is never
        // conveyed while it disagrees with what is on screen. Measured in
        // e2e/smoke.spec.ts rather than assumed, with role counts that separate
        // "in the DOM" from "in the tree", plus a visibility check.
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        // The name used to come from the icon's `alt`, which is why it is stated
        // here: the icon has now been swapped for a Phosphor glyph, and an
        // `aria-hidden` SVG has no `alt` to carry a name in. The icon is
        // decorative not to prevent a doubled name -- `aria-label` already
        // replaces descendant content in the name computation -- but so it stops
        // being a node of its own.
        aria-label="Menu"
        // Positioned so it paints above the scrim. Without this the toggle would
        // sit under it and the one control guaranteed to close the panel would be
        // the one click the scrim swallowed. It dropped a conditional bottom
        // margin that spaced it from the list; the panel is out of flow now and
        // the strip's own padding is the gap.
        className="relative z-10 lg:hidden p-2 text-white bg-brand rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        onClick={toggleMenu}
      >
        <List size={24} aria-hidden="true" />
      </button>
      <ul
        ref={menuRef}
        id={MENU_ID}
        // Out of flow below the breakpoint, so expanding no longer moves <main>
        // down the page. Still toggled with a layout-affecting class rather than
        // opacity: the collapsed list has to stay out of the accessibility tree,
        // and e2e/smoke.spec.ts asserts exactly that on both sides.
        //
        // The width cap is a percentage of the strip, which spans the viewport,
        // rather than a viewport unit -- `100vw` counts the classic scrollbar the
        // cap exists to avoid, so at a narrow width it would reintroduce the
        // overflow by the scrollbar's own width.
        //
        // The desktop line restores a property default for each overlay value it
        // faces. The two insets and the z-index used to be the exceptions -- they
        // had no counterpart, because `lg:static` leaves all three inoperative on
        // a static box -- and #136 added `lg:left-auto lg:top-auto lg:z-auto`
        // anyway. Those three are therefore INERT today, and deliberately so:
        // anything that makes this box positioned again, or its parent a flex or
        // grid container, would otherwise reactivate all three at once with no
        // reset in the file to stop it.
        //
        // One value genuinely has no counterpart and is not worth adding one for:
        // `shadow-black` sets a colour that survives to desktop, where
        // `lg:shadow-none` removes the shadow it would have coloured. So "a
        // counterpart for every overlay value" is the intent rather than a literal
        // property of the string -- worth stating, because an earlier version of
        // this comment claimed the literal.
        className={clsx(
          "absolute left-2 top-full z-10 w-[250px] max-w-[calc(100%-1rem)] rounded bg-surface p-2 shadow-2xl shadow-black",
          "lg:static lg:left-auto lg:top-auto lg:z-auto lg:w-auto lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none",
          // The band's links sit on the same measure as the page content, so the
          // two share a left edge instead of the nav hugging the viewport while
          // the content is centred. Taken from the shared constant rather than
          // restated, so it cannot drift from what the pages use. It also
          // replaces `lg:max-w-none`, which was only here to reset the overlay's
          // own cap -- the measure resets it and sets the column in one value.
          contentColumnClasses,
          "space-y-2 lg:flex lg:space-y-0 lg:gap-x-2",
          isOpen ? "block" : "hidden",
        )}
      >
        {NAV_ITEMS.map((item) => {
          // Read once and used for both the styling and `aria-current`: the
          // active page was already styled, so the state existed all along and
          // was just never exposed non-visually. Sharing the comparison is what
          // stops the two representations of it from ever disagreeing.
          const isActive = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  // Keyboard focus draws a halo rather than changing the
                  // background: it used to reuse the active-page background, so
                  // the two states were indistinguishable. Avoid bare Tailwind
                  // class words in this comment; the scanner emits them as CSS.
                  "block p-2 rounded hover:bg-gray-400 hover:text-zinc-900 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  {
                    // zinc-300 on --brand is only 3.64:1; white is 5.38:1.
                    "bg-brand text-white": isActive,
                    "bg-surface": !isActive,
                  },
                )}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MainNav;
