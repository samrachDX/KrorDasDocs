import clsx from "clsx";
import styles from "./docs.module.css";

export default function DocsFooterBranding({
  className,
  refSource = "public-space",
}: {
  className?: string;
  refSource?: string;
}) {
  return (
    <footer className={clsx(styles.footer, className)}>
      <span className={styles.footerBranding}>
        KrorDas Docs · Editor by SamrachDX
      </span>
    </footer>
  );
}
