import React from "react";
import { Stack, Text } from "@mantine/core";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Stack align="center" gap={4} className={classes.logo}>
        <img
          src="/icons/krordas-logo.png"
          alt="KrorDas Docs"
          style={{ height: 64, width: "auto", userSelect: "none" }}
        />
        <Text size="xs" c="dimmed">
          Editor by SamrachDX
        </Text>
      </Stack>
      <main>{children}</main>
    </>
  );
}
