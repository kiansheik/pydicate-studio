'use strict';

// Original, two-page vector-only fixture, generated from PDF objects and a valid xref.
// A blue rectangle at [100, 300, 260, 400] gives the tests a physical landmark.
function makePdfFixture({ variant = false } = {}) {
  const stream = variant
    ? '1 0 0 rg 100 300 160 100 re f\n'
    : '0.05 0.3 0.8 rg 100 300 160 100 re f\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Rotate 90 /Contents 4 0 R /Resources << >> >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

module.exports = { makePdfFixture };
