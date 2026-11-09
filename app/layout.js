export const metadata = {
  title: "PDF Create",
  description: "Create and edit print-ready PDFs."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
