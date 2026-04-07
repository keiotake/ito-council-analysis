const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

async function main() {
  const data = new Uint8Array(fs.readFileSync('kaiha_meibo.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join('');
    console.log(`--- Page ${i} ---`);
    console.log(text);
  }
}
main().catch(console.error);
