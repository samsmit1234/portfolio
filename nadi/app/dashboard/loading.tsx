import styles from "./dashboard.module.css";

// Shown instantly while the server loads the board (navigation and app start).
export default function Loading() {
  return (
    <main className={styles.main} aria-busy="true">
      <div className={styles.skeleton} style={{ blockSize: 60, maxInlineSize: 420 }} />
      <div className={styles.columns}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeleton} style={{ blockSize: 160 }} />
        ))}
      </div>
    </main>
  );
}
