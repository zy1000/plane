import html2canvas from "html2canvas";
import jsPDF from "jspdf";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportDashboardAsPng(target: HTMLElement, filenameBase: string) {
  const canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
    windowWidth: target.scrollWidth,
    windowHeight: target.scrollHeight,
  });
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
  if (!blob) throw new Error("无法生成 PNG");
  downloadBlob(blob, `${filenameBase}.png`);
}

export async function exportDashboardAsPdf(target: HTMLElement, filenameBase: string) {
  const canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: target.scrollWidth,
    windowHeight: target.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/png", 1);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let renderedHeight = 0;
  while (renderedHeight < imgHeight) {
    const position = -renderedHeight;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    renderedHeight += pageHeight;
    if (renderedHeight < imgHeight) pdf.addPage();
  }

  pdf.save(`${filenameBase}.pdf`);
}

