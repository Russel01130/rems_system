/* Shared PDF writer for text-based receipts, transaction details and filtered reports. The jsPDF library supplies the document format. */

// Uses jsPDF to wrap and paginate report or receipt text before saving an A4 document.
function downloadReceiptPdf(title, details, filename) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 42;
    const lineHeight = 16;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(title, margin, margin);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);

    const lines = pdf.splitTextToSize(details.replaceAll('₱', 'PHP '), pageWidth - 2 * margin);
    let y = margin + 28;
    for (const line of lines) {
        if (y > pageHeight - margin) {
            pdf.addPage();
            y = margin;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
    }
    pdf.save(filename);
}
