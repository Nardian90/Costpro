import { expect, test } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPDFDocument } from '../lazy-pdf';

test('createPDFDocument returns a doc that can use autoTable', async () => {
  const doc = await createPDFDocument();
  expect(typeof autoTable).toBe('function');

  // Test if it can be called with the doc without throwing
  autoTable(doc, {
    head: [['Name', 'Email', 'Country']],
    body: [
      ['David', 'david@example.com', 'Sweden'],
      ['Castille', 'castille@example.com', 'Spain'],
    ],
  });

  // In some environments, autoTable also adds the method to the instance
  // We want to make sure the function call works first.
  expect(doc.internal.pages.length).toBeGreaterThan(0);
});
