import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Generate PDF from an HTML element
 * @param {HTMLElement} element - The HTML element to convert to PDF
 * @param {string} filename - The filename for the PDF
 * @returns {Promise<Blob>} - The generated PDF as a Blob
 */
export const generatePDFFromElement = async (element, filename = 'document.pdf') => {
  try {
    // A4 dimensions in mm
    const a4Width = 210;
    const a4Height = 297;
    
    // Create canvas from HTML element with optimal settings for A4
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality (balance between quality and file size)
      useCORS: true, // Allow cross-origin images
      logging: false, // Disable logging
      backgroundColor: '#ffffff',
      windowWidth: 794, // A4 width in pixels at 96 DPI (210mm)
      windowHeight: 1123, // A4 height in pixels at 96 DPI (297mm)
      width: element.scrollWidth,
      height: element.scrollHeight
    });

    // Calculate dimensions to fit A4
    const imgWidth = a4Width;
    const imgHeight = (canvas.height * a4Width) / canvas.width;
    
    // Create PDF with A4 dimensions
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true // Enable compression for smaller file size
    });

    let heightLeft = imgHeight;
    let position = 0;
    const pageHeight = a4Height;

    // Add first page
    const imgData = canvas.toDataURL('image/jpeg', 0.95); // JPEG with 95% quality for smaller size
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Return as blob
    return pdf.output('blob');
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Generate PDF and download it
 * @param {HTMLElement} element - The HTML element to convert to PDF
 * @param {string} filename - The filename for the PDF
 */
export const downloadPDF = async (element, filename = 'document.pdf') => {
  try {
    const blob = await generatePDFFromElement(element, filename);
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return blob;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
};

/**
 * Convert blob to base64
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} - Base64 string
 */
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]; // Remove data:application/pdf;base64, prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
