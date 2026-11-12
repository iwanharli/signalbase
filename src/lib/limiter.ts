/** At most `max` holders at once: `acquire()` resolves with a release function once a slot is free (first come, first served). */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const grant = () => {
    active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      waiting.shift()?.();
    };
  };
  return {
    acquire: () => new Promise<() => void>((resolve) => {
      if (active < max) resolve(grant());
      else waiting.push(() => resolve(grant()));
    }),
  };
}
