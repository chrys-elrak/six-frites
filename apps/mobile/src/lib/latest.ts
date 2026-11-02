import { useLayoutEffect, useRef } from "react";

/** A ref that holds the latest `value`, refreshed after every render, for gesture and event handlers made once. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
