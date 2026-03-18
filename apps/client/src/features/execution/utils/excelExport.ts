/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Bill, ProjectMetadata } from '../types';
import XLSX_Style from 'xlsx-js-style';

export const exportStyledExcel = (
  activeBill: Bill,
  projectData: ProjectMetadata,
  printOptions: { summary: boolean; measurements: boolean }
) => {
  if (!activeBill) return;

  if (!XLSX_Style || !XLSX_Style.utils) {
    return;
  }

  const wb = XLSX_Style.utils.book_new();

  // Set Workbook to RTL View globally if supported by the viewer
  wb.Workbook = {
    Views: [{ RTL: true }],
  };

  // --- STYLES DEFINITION ---
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '334155' } }, // Slate-700
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  };

  const itemStyle = {
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  };

  const numberStyle = {
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  };

  const currencyStyle = {
    numFmt: '#,##0.00 "₪"',
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  };

  // --- GENERATE TABLE DATA (Logic duplicated from BillingView to ensure consistency) ---
  const items = [...activeBill.items].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
  );
  const rows: any[] = [];

  let curStruct = '';
  let curChapter = '';
  let curSubchap = '';

  let sumSubK = 0;
  let sumChapK = 0;
  let sumStructK = 0;
  let totalK = 0;

  const pushSummary = (
    title: string,
    amount: number,
    type: 'subchapter' | 'chapter' | 'structure'
  ) => {
    rows.push({ isSummary: true, type, description: title, totalAmount: amount });
  };

  items.forEach((item) => {
    const parts = item.code.split('.');
    const struct = parts[0] || '';
    const chapter = parts[1] || '';
    const subchap = parts[2] || '';

    if (struct !== curStruct) {
      if (curStruct !== '') {
        pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
        pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
        pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
      }
      curStruct = struct;
      curChapter = '';
      curSubchap = '';
      sumStructK = 0;
      sumChapK = 0;
      sumSubK = 0;
      rows.push({ isHeader: true, type: 'structure', description: `מבנה ${struct}` });
    }

    if (chapter !== curChapter) {
      if (curChapter !== '') {
        pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
        pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
      }
      curChapter = chapter;
      curSubchap = '';
      sumChapK = 0;
      sumSubK = 0;
      rows.push({ isHeader: true, type: 'chapter', description: `פרק ${chapter}` });
    }

    if (subchap !== curSubchap) {
      if (curSubchap !== '') {
        pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
      }
      curSubchap = subchap;
      sumSubK = 0;
      rows.push({ isHeader: true, type: 'subchapter', description: `תת-פרק ${subchap}` });
    }

    rows.push({ ...item, isItem: true });
    sumSubK += item.totalAmount;
    sumChapK += item.totalAmount;
    sumStructK += item.totalAmount;
    totalK += item.totalAmount;
  });

  if (curStruct !== '') {
    pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
    pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
    pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
  }

  rows.push({
    isSummary: true,
    type: 'total',
    description: 'סך הכל לחשבון מצטבר',
    totalAmount: totalK,
  });
  const tableData = rows;

  // --- 1. SUMMARY SHEET ---
  if (printOptions.summary) {
    const wsData: any[] = [];

    // Header Row
    const headers = [
      'קוד סעיף',
      'תיאור סעיף',
      'יחידה',
      'כמות חוזה',
      'כמות קודמת',
      'לחשבון זה',
      'כמות מצטברת',
      'מחיר יחידה',
      'הנחה',
      'סה"כ לתשלום',
    ];
    const headerRow = headers.map((h) => ({ v: h, s: headerStyle }));
    wsData.push(headerRow);

    let rowIndex = 2; // Excel row index (1-based), starts after header

    // Formula Tracking Arrays (Storing row numbers for sums)
    let subChapterItems: number[] = []; // Stores rows of items in current subchapter
    let subChapterTotals: number[] = []; // Stores rows of subchapter totals in current chapter
    let chapterTotals: number[] = []; // Stores rows of chapter totals in current structure
    const structureTotals: number[] = []; // Stores rows of structure totals for grand total

    tableData.forEach((row) => {
      const r = rowIndex;

      if (row.isItem) {
        // Determine Excel Row for Formulas
        // Formulas:
        // Current Qty (F) = Cumulative (G) - Previous (E)
        // Total Amount (J) = Cumulative (G) * Price (H) * (1 - Discount(I))

        wsData.push([
          { v: row.code, s: itemStyle },
          {
            v: row.description,
            s: { ...itemStyle, alignment: { horizontal: 'right', wrapText: true } },
          },
          { v: row.unit, s: numberStyle },
          { v: row.contractQuantity, t: 'n', s: numberStyle },
          { v: row.previousQuantity, t: 'n', s: numberStyle },

          // F: Current Qty Formula
          {
            t: 'n',
            f: `G${r}-E${r}`,
            s: {
              ...numberStyle,
              font: { bold: true, color: { rgb: '1D4ED8' } },
              fill: { fgColor: { rgb: 'EFF6FF' } },
            },
          },

          // G: Cumulative (Hardcoded from state usually, but let's keep it value based for stability or user input)
          {
            v: row.currentQuantity,
            t: 'n',
            s: { ...numberStyle, font: { bold: true }, fill: { fgColor: { rgb: 'F0FDF4' } } },
          },

          { v: row.unitPrice, t: 'n', s: currencyStyle },
          { v: row.discount, t: 'n', s: numberStyle, numFmt: '0%' },

          // J: Total Amount Formula (Col Index 9)
          { t: 'n', f: `G${r}*H${r}*(1-I${r})`, s: { ...currencyStyle, font: { bold: true } } },
        ] as any[]);

        // Track this item for the upcoming sub-chapter sum
        subChapterItems.push(r);
      } else {
        // Header or Summary Row
        let styleToUse: any = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '475569' } },
        };
        let formula = null;

        if (row.isSummary) {
          if (row.type === 'subchapter') {
            // Sum items in this subchapter
            if (subChapterItems.length > 0) {
              formula = `SUM(J${subChapterItems[0]}:J${subChapterItems[subChapterItems.length - 1]})`;
            }
            subChapterItems = []; // Reset for next subchapter
            subChapterTotals.push(r); // Track this total for the chapter sum

            styleToUse = {
              font: { bold: true },
              fill: { fgColor: { rgb: 'E2E8F0' } },
              border: { top: { style: 'thin' } },
            };
          } else if (row.type === 'chapter') {
            // Sum subchapters in this chapter
            if (subChapterTotals.length > 0) {
              formula = `SUM(J${subChapterTotals.join(',J')})`;
            }
            subChapterTotals = []; // Reset
            chapterTotals.push(r); // Track for structure sum

            styleToUse = {
              font: { bold: true, sz: 11 },
              fill: { fgColor: { rgb: 'CBD5E1' } },
              border: { top: { style: 'medium' } },
            };
          } else if (row.type === 'structure') {
            // Sum chapters in this structure
            if (chapterTotals.length > 0) {
              formula = `SUM(J${chapterTotals.join(',J')})`;
            }
            chapterTotals = []; // Reset
            structureTotals.push(r); // Track for grand total

            styleToUse = {
              font: { bold: true, sz: 12 },
              fill: { fgColor: { rgb: '94A3B8' } },
              border: { top: { style: 'thick' } },
            };
          } else if (row.type === 'total') {
            // Grand Total
            if (structureTotals.length > 0) {
              formula = `SUM(J${structureTotals.join(',J')})`;
            }
            styleToUse = {
              font: { bold: true, sz: 14 },
              fill: { fgColor: { rgb: 'F1F5F9' } },
              border: { top: { style: 'double' } },
            };
          }
        } else if (row.isHeader) {
          // Structure/Chapter/Subchapter Headers
          if (row.type === 'structure')
            styleToUse = {
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '334155' } },
            }; // Dark Slate
          if (row.type === 'chapter')
            styleToUse = {
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '475569' } },
            };
          if (row.type === 'subchapter')
            styleToUse = {
              font: { bold: true },
              fill: { fgColor: { rgb: 'F1F5F9' } },
              border: { bottom: { style: 'thin' } },
            };
        }

        // Create the row content
        const rowContent = new Array(10).fill({ v: '', s: styleToUse });
        rowContent[0] = { v: row.description, s: styleToUse }; // Description in A

        // Set the Total cell (Column J / Index 9)
        if (formula) {
          rowContent[9] = { t: 'n', f: formula, s: { ...styleToUse, numFmt: '#,##0.00 "₪"' } };
        } else if (row.totalAmount) {
          // Fallback for header rows if they carry amounts (usually don't)
          rowContent[9] = {
            v: row.totalAmount,
            t: 'n',
            s: { ...styleToUse, numFmt: '#,##0.00 "₪"' },
          };
        }

        wsData.push(rowContent);
      }
      rowIndex++;
    });

    const ws = XLSX_Style.utils.aoa_to_sheet([]);

    // Populate sheet
    ws['!ref'] = XLSX_Style.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: 9, r: wsData.length - 1 },
    });
    for (let R = 0; R < wsData.length; ++R) {
      for (let C = 0; C < wsData[R].length; ++C) {
        const cellRef = XLSX_Style.utils.encode_cell({ c: C, r: R });
        ws[cellRef] = wsData[R][C];
      }
    }

    // Column Widths
    ws['!cols'] = [
      { wch: 15 },
      { wch: 50 },
      { wch: 8 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
    ];

    // RTL Direction for Sheet
    ws['!views'] = [{ rightToLeft: true }];

    XLSX_Style.utils.book_append_sheet(wb, ws, 'ריכוז חשבון');
  }

  // --- 2. INDIVIDUAL MEASUREMENT SHEETS PER ITEM ---
  if (printOptions.measurements) {
    // Sort items chronologically/numerically by code
    const sortedItems = [...activeBill.items].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Header Styles for Measurement Sheets
    const pageTitleStyle = {
      font: { bold: true, sz: 14, underline: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    };

    const boxHeaderStyle = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'F1F5F9' } }, // Slate-100
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    const boxValueStyle = {
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    const tableHeaderStyle = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E2E8F0' } }, // Slate-200
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    sortedItems.forEach((item) => {
      // Skip items with no measurements if desired, or keep them empty.
      // Usually we only want sheets for items with data.
      if (!item.measurements || item.measurements.length === 0) return;

      const wsData: any[] = [];
      let rowIdx = 0;

      // --- HEADER SECTION (Mirroring the Modal) ---

      // Row 0: Spacing
      wsData.push([]);
      rowIdx++;

      // Row 1: Project Header (Contractor Logo / Title / Client Logo)
      // Simplified for Excel text representation
      wsData.push([
        {
          v: projectData.contractorName || 'קבלן',
          s: { font: { bold: true, alignment: { horizontal: 'right' } } },
        },
        null,
        null,
        null,
        {
          v: `פרויקט: ${projectData.name} - חוזה: ${projectData.contractNumber}`,
          s: pageTitleStyle,
        },
        null,
        null,
        null,
        {
          v: projectData.clientName || 'מזמין',
          s: { font: { bold: true, alignment: { horizontal: 'left' } } },
        },
      ]);
      // Merge Title across middle columns
      if (!wsData[rowIdx]['!merges']) wsData[rowIdx]['!merges'] = [];
      // (Not strictly setting merges here for simplicity in this array construction, but normally done via ws['!merges'])
      rowIdx++;

      // Row 2: Item Title Header
      wsData.push([
        null,
        null,
        null,
        null,
        {
          v: `ריכוז כמויות עבור סעיף מס': ${item.code}`,
          s: { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } },
        },
        null,
        null,
        null,
        null,
      ]);
      rowIdx++;
      wsData.push([]);
      rowIdx++; // Spacer

      // Row 4: Item Info Table Header
      wsData.push([
        { v: "סעיף מס'", s: boxHeaderStyle },
        { v: 'תיאור הסעיף', s: boxHeaderStyle },
        null,
        null, // Description takes 3 cols
        { v: "יח'", s: boxHeaderStyle },
        { v: 'כמות חוזה', s: boxHeaderStyle },
        null,
        null,
        null, // Fill rest
      ]);
      rowIdx++;

      // Row 5: Item Info Values
      wsData.push([
        { v: item.code, s: boxValueStyle },
        { v: item.description, s: { ...boxValueStyle, alignment: { horizontal: 'right' } } },
        null,
        null,
        { v: item.unit, s: boxValueStyle },
        { v: item.contractQuantity, s: boxValueStyle },
        null,
        null,
        null,
      ]);
      rowIdx++;
      wsData.push([]);
      rowIdx++; // Spacer

      // --- TABLE MEASUREMENTS ---

      // Columns Mapping (0-based indices)
      // 0: מס חשבון (Bill No)
      // 1: דף (Sheet)
      // 2: תיאור/מיקום (Description)
      // 3: כמות מחושבת (Qty)
      // 4: %
      // 5: סה"כ לתשלום (Total) - Yellow
      // 6: מצטבר (Cumulative) - Grey
      // 7: מאושרת (Approved)
      // 8: הערות (Remarks)

      const tableHeaders = [
        'מס חשבון',
        'דף מספר',
        'תאור העבודה (מיקום/חישוב)',
        'כמות מחושבת',
        '%',
        'כמות הגשה נוכחית',
        'מצטברת',
        'מאושרת',
        'הערות',
      ];

      wsData.push(
        tableHeaders.map((h) => {
          // Special color for Total/Cumulative headers
          if (h === 'כמות הגשה נוכחית')
            return { v: h, s: { ...tableHeaderStyle, fill: { fgColor: { rgb: 'FEF9C3' } } } }; // Yellow-50 equivalent
          if (h === 'מצטברת')
            return { v: h, s: { ...tableHeaderStyle, fill: { fgColor: { rgb: 'F1F5F9' } } } }; // Slate-100 equivalent
          return { v: h, s: tableHeaderStyle };
        })
      );

      rowIdx++;

      item.measurements.forEach((m, idx) => {
        const r = rowIdx + 1; // Current Excel Row (1-based)

        // Formulas
        // Total (Col F/Index 5) = Qty(D/3) * % (E/4) / 100
        // Cumulative (Col G/Index 6) = Prev Cumul + Curr Total
        const qtyRef = `D${r}`;
        const pctRef = `E${r}`;
        const totalRef = `F${r}`;

        const totalFormula = `${qtyRef}*(${pctRef}/100)`;
        const cumulFormula = idx === 0 ? totalRef : `G${r - 1}+${totalRef}`;

        wsData.push([
          { v: m.billNumber, s: boxValueStyle }, // A
          { v: m.sheetId || '1', s: boxValueStyle }, // B
          { v: m.description, s: { ...itemStyle, alignment: { horizontal: 'right' } } }, // C (Wide)
          { v: m.quantity, t: 'n', s: boxValueStyle }, // D
          { v: m.partialPercentage, t: 'n', s: boxValueStyle }, // E
          {
            t: 'n',
            f: totalFormula,
            s: { ...boxValueStyle, font: { bold: true }, fill: { fgColor: { rgb: 'FEF9C3' } } },
          }, // F
          {
            t: 'n',
            f: cumulFormula,
            s: { ...boxValueStyle, font: { bold: true }, fill: { fgColor: { rgb: 'F1F5F9' } } },
          }, // G
          {
            v: m.approvedQuantity || '',
            s: { ...boxValueStyle, font: { color: { rgb: '15803D' }, bold: true } },
          }, // H
          { v: m.remarks || '', s: itemStyle }, // I
        ]);
        rowIdx++;
      });

      // Footer / Total Row
      wsData.push([
        null,
        null,
        {
          v: 'סה"כ כמות מצטברת לחשבון זה:',
          s: { font: { bold: true, alignment: { horizontal: 'left' } } },
        },
        null,
        null,
        null,
        {
          t: 'n',
          f: `G${rowIdx}`,
          s: { font: { bold: true, sz: 12 }, border: { top: { style: 'double' } } },
        }, // Total Cumulative
        null,
        null,
      ]);

      // Create Sheet
      const ws = XLSX_Style.utils.aoa_to_sheet([]);

      // Merges
      ws['!merges'] = [
        { s: { r: 1, c: 4 }, e: { r: 1, c: 6 } }, // Header Title Row 1
        { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } }, // Item Code Row 2
        { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } }, // Description Header
        { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } }, // Description Value
      ];

      // Populate
      ws['!ref'] = XLSX_Style.utils.encode_range({
        s: { c: 0, r: 0 },
        e: { c: 8, r: wsData.length - 1 },
      });
      for (let R = 0; R < wsData.length; ++R) {
        for (let C = 0; C < (wsData[R] || []).length; ++C) {
          const cellRef = XLSX_Style.utils.encode_cell({ c: C, r: R });
          if (wsData[R][C]) ws[cellRef] = wsData[R][C];
        }
      }

      // Col Widths
      ws['!cols'] = [
        { wch: 10 }, // Bill No
        { wch: 8 }, // Sheet
        { wch: 40 }, // Desc
        { wch: 12 }, // Qty
        { wch: 8 }, // %
        { wch: 15 }, // Total
        { wch: 15 }, // Cumul
        { wch: 12 }, // Approved
        { wch: 25 }, // Remarks
      ];

      ws['!views'] = [{ rightToLeft: true }];

      // Sanitize Sheet Name (Excel Limit 31 chars, no special chars)
      let sheetName = item.code.replace(/[/\\?*[\]]/g, '_');
      if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

      XLSX_Style.utils.book_append_sheet(wb, ws, sheetName);
    });
  }

  // Export file
  XLSX_Style.writeFile(wb, `חשבון_${activeBill.number}_${projectData.contractorName}.xlsx`);
};
