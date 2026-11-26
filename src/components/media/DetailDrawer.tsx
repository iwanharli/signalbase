"use client";
// Detail of a post, news item or image as a drawer from the right (70% of the screen; full width on small screens), so
// the feed stays in view beside it. Its content keeps the detail layout (media/modal.module.css): dark header, the post
// on the left and everything about it on the right, each column scrolling on its own.
import { Drawer } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import classes from "./modal.module.css";

export function DetailDrawer({ opened, onClose, label, tone, children }: { opened: boolean; onClose: () => void; label: string; tone?: string; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 860px)");
  return (
    <Drawer.Root opened={opened} onClose={onClose} position="right" size={narrow ? "100%" : "70%"} padding={0}
      transitionProps={{ transition: "slide-left", duration: reducedMotion ? 0 : 280, timingFunction: "cubic-bezier(.2,.8,.2,1)" }}>
      <Drawer.Overlay backgroundOpacity={0.5} blur={3} />
      <Drawer.Content className={classes.drawer} aria-label={label} style={{ ["--tone" as string]: tone }}>
        <Drawer.Body className={classes.drawerBody}>{children}</Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
}
