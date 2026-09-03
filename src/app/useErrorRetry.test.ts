import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// One ordered log rather than three separate spies: the load-bearing claim is
// that the refresh runs *inside* the transition scope, which only an ordering
// assertion can pin.
const calls: string[] = [];
const refresh = vi.fn(() => void calls.push("refresh"));
const reset = vi.fn(() => void calls.push("reset"));
const reload = vi.fn(() => void calls.push("reload"));
const startTransition = vi.fn((scope: () => void) => {
  calls.push("startTransition");
  scope();
});

// `retrying` is driven directly instead of through a renderer: this repo's
// Vitest runs in `node` with no DOM, and a click while the transition is still
// pending is the whole behaviour under test.
let pending = false;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useTransition: () => [pending, startTransition],
}));

import useErrorRetry from "./useErrorRetry";
import RootError from "./error";
import GlobalError from "./global-error";
import BlogError from "./blog/error";

type Boundary = (props: {
  error: Error & { digest?: string };
  reset: () => void;
}) => ReactElement;

type ButtonProps = {
  onClick: () => void;
  "aria-busy"?: boolean;
  "aria-disabled"?: boolean;
};

function findButton(node: ReactNode): ReactElement<ButtonProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = findButton(child);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === "button") return element as ReactElement<ButtonProps>;
  return findButton(element.props?.children);
}

function retryButton(Boundary: Boundary): ReactElement<ButtonProps> {
  const tree = Boundary({ error: new Error("boom"), reset });
  const button = findButton(tree);
  if (!button) throw new Error("no <button> in the rendered tree");
  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  pending = false;
  vi.stubGlobal("window", { location: { reload } });
});

describe("useErrorRetry", () => {
  it("runs the refresh inside the transition scope, before clearing the error", () => {
    useErrorRetry(reset).retry();
    expect(calls).toEqual(["startTransition", "refresh", "reset"]);
  });

  it("reports the transition's pending state as `retrying`", () => {
    pending = true;
    expect(useErrorRetry(reset).retrying).toBe(true);
  });

  it("escalates to a full document load rather than starting a second transition", () => {
    pending = true;
    useErrorRetry(reset).retry();
    expect(calls).toEqual(["reload"]);
  });
});

describe.each([
  ["error.tsx", RootError as Boundary],
  ["global-error.tsx", GlobalError as Boundary],
  ["blog/error.tsx", BlogError as Boundary],
])("%s", (_name, Boundary) => {
  it("refreshes and clears the boundary on the first click", () => {
    retryButton(Boundary).props.onClick();
    expect(calls).toEqual(["startTransition", "refresh", "reset"]);
  });

  it("escalates to a full document load when clicked while still retrying", () => {
    pending = true;
    retryButton(Boundary).props.onClick();
    expect(calls).toEqual(["reload"]);
  });

  it("marks the retry control busy, never disabled, so it stays operable", () => {
    pending = true;
    const props = retryButton(Boundary).props;
    expect(props["aria-busy"]).toBe(true);
    expect(props["aria-disabled"]).toBeUndefined();
  });
});
