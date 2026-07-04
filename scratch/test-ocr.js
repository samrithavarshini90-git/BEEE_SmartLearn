import Tesseract from 'tesseract.js';

// 1x1 base64 transparent PNG to test pipeline
const testImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function testOCR() {
  console.log("Starting Tesseract OCR check (ES Module)...");
  try {
    const { data: { text } } = await Tesseract.recognize(testImageBase64, 'eng');
    console.log("OCR Success! Extracted text:", JSON.stringify(text));
  } catch (err) {
    console.error("OCR Error occurred:", err);
  }
}

testOCR();
