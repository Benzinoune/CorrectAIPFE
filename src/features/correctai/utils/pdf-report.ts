import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Exam, ScannedCopy } from '../types';
import { buildCopyCorrectionSummary } from '../screens/professor/shared';

const CSS_STYLES = `
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    color: #121422;
    -webkit-print-color-adjust: exact;
  }
  .page {
    display: flex;
    width: 100%;
    height: 100vh;
    padding: 40px;
    box-sizing: border-box;
    page-break-after: always;
  }
  .page.page-compact {
    padding: 10px 40px;
  }
  .page.page-compact .brand {
    margin-bottom: 5px;
  }
  .page.page-compact .summary-table {
    margin-bottom: 5px;
  }
  .page.page-compact .image-container {
    margin-bottom: 5px;
  }
  .left-col {
    flex: 1;
    padding-right: 30px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .right-col {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: flex;
    align-items: center;
    margin-bottom: 30px;
  }
  .brand-icon {
    width: 32px;
    height: 32px;
    background-color: #6C5CFF;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 18px;
    margin-right: 12px;
  }
  .brand h1 {
    margin: 0;
    color: #121422;
    font-size: 24px;
    font-weight: 900;
  }
  .brand h1 span {
    color: #6C5CFF;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid #E4E8F0;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 20px;
    font-size: 13px;
  }
  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid #E4E8F0;
    border-right: 1px solid #E4E8F0;
  }
  th:last-child, td:last-child {
    border-right: none;
  }
  tr:last-child th, tr:last-child td {
    border-bottom: none;
  }
  .summary-table th {
    background-color: #F3F5FA;
    width: 130px;
    font-weight: 700;
    color: #657084;
  }
  .summary-table td {
    font-weight: 600;
  }
  .details-table-wrap {
    flex: 1;
    overflow: hidden;
  }
  .details-table {
    margin-bottom: 0;
    border: none;
    border-top: 1px solid #E4E8F0;
    border-bottom: 1px solid #E4E8F0;
    border-radius: 0;
  }
  .details-table th {
    background-color: #6C5CFF;
    color: white;
    font-weight: 700;
    text-align: center;
    border-right: 1px solid rgba(255,255,255,0.2);
  }
  .details-table td {
    text-align: center;
    font-weight: 500;
    font-size: 12px;
  }
  .details-table tr:nth-child(even) td {
    background-color: #F9FAFC;
  }
  .details-table.compact th, .details-table.compact td {
    padding: 3px 6px;
    font-size: 9px;
  }
  .details-table.super-compact th, .details-table.super-compact td {
    padding: 0px 1px;
    font-size: 5.5px;
    line-height: 1;
  }
  .score-danger { color: #F04452; font-weight: 700; }
  .score-success { color: #00B884; font-weight: 700; }
  .score-warning { color: #F2A000; font-weight: 700; }
  
  .image-container {
    flex: 1;
    min-height: 0;
    margin-bottom: 20px;
    border: 2px solid #E4E8F0;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background-color: #F3F5FA;
    padding: 10px;
  }
  .image-container img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  .footer {
    font-size: 11px;
    color: #A1A7B4;
    font-weight: 500;
  }
`;

async function getBase64Image(uri: string): Promise<string | null> {
  if (!uri) return null;
  try {
    if (uri.startsWith('http')) {
      const { uri: localUri } = await FileSystem.downloadAsync(uri, FileSystem.cacheDirectory + 'temp_report_img.jpg');
      uri = localUri;
    }
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    return null;
  }
}

function generateCopyHtml(copy: ScannedCopy, exam: Exam, imageBase64: string | null): string {
  const summary = buildCopyCorrectionSummary(exam, copy);
  
  const formattedDate = new Date(copy.scannedAt).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const pctColorClass = summary.percentage >= 50 ? 'score-success' : summary.percentage > 0 ? 'score-warning' : 'score-danger';

  let rowsHtml = '';
  for (const row of summary.rows) {
    const ptsColor = row.pointsEarned === row.points ? 'score-success' : row.pointsEarned > 0 ? 'score-warning' : 'score-danger';
    rowsHtml += `
      <tr>
        <td>${row.number}</td>
        <td>${row.correctAnswer || '—'}</td>
        <td>${row.studentAnswer || '—'}</td>
        <td class="${ptsColor}">${row.pointsEarned}</td>
        <td>${row.points}</td>
      </tr>
    `;
  }

  let tableClass = 'details-table';
  const numRows = summary.rows.length;
  if (numRows > 60) {
    tableClass = 'details-table super-compact';
  } else if (numRows > 30) {
    tableClass = 'details-table compact';
  }

  const rightColHtml = `
    <div class="details-table-wrap">
      <table class="${tableClass}">
        <thead>
          <tr>
            <th>N°</th>
            <th>Clé</th>
            <th>Étu</th>
            <th>Pts</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  const imageHtml = imageBase64 
    ? `<img src="${imageBase64}" />` 
    : `<div style="color:#A1A7B4; align-self:center; margin-top:50px;">Aucune image disponible</div>`;

  return `
    <div class="page ${numRows > 60 ? 'page-compact' : ''}">
      <div class="left-col">
        <div class="brand">
          <div class="brand-icon">✓</div>
          <h1>Correct<span>AI</span></h1>
        </div>
        
        <table class="summary-table">
          <tr>
            <th>Étudiant</th>
            <td>${copy.studentName || 'Non identifié'}</td>
          </tr>
          <tr>
            <th>Matricule</th>
            <td>${copy.matricule || '—'}</td>
          </tr>
          <tr>
            <th>Classe</th>
            <td>${copy.className || '—'}</td>
          </tr>
          <tr>
            <th>Examen</th>
            <td>${exam.name}</td>
          </tr>
          <tr>
            <th>Date de scan</th>
            <td>${formattedDate}</td>
          </tr>
          <tr>
            <th>Points Obtenus</th>
            <td class="${pctColorClass}">${summary.totalPoints}</td>
          </tr>
          <tr>
            <th>Points Possibles</th>
            <td>${summary.maxPoints}</td>
          </tr>
          <tr>
            <th>Résultat</th>
            <td class="${pctColorClass}">${summary.percentage}%</td>
          </tr>
        </table>

        <div class="image-container">
          ${imageHtml}
        </div>

        <div class="footer">
          Généré par CorrectAI le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}
        </div>
      </div>

      <div class="right-col">
        ${rightColHtml}
      </div>
    </div>
  `;
}

export async function generateCopiesReportPDF(exam: Exam, copies: ScannedCopy[]): Promise<string> {
  if (!copies || copies.length === 0) {
    throw new Error("Aucune copie à exporter.");
  }

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>${CSS_STYLES}</style>
    </head>
    <body>
  `;

  for (const copy of copies) {
    const base64 = copy.imageUri ? await getBase64Image(copy.imageUri) : null;
    htmlContent += generateCopyHtml(copy, exam, base64);
  }

  htmlContent += `
    </body>
    </html>
  `;

  try {
    const { base64 } = await Print.printToFileAsync({
      html: htmlContent,
      base64: true,
    });
    
    if (!base64) {
      throw new Error("Génération base64 échouée");
    }

    // Fix for Android sharing: write base64 directly to document directory
    const pdfName = `CorrectAI_Rapport_${exam.id}_${Date.now()}.pdf`;
    const destUri = `${FileSystem.documentDirectory}${pdfName}`;
    
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64
    });

    return destUri;
  } catch (error) {
    console.error("[PDFReport] PDF Generation failed:", error);
    throw new Error("Échec de la génération du PDF.");
  }
}

export async function shareCopiesReportPDF(uri: string) {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Exporter le rapport des copies',
        UTI: 'com.adobe.pdf',
      });
    } else {
      throw new Error("Le partage n'est pas disponible sur cet appareil.");
    }
  } catch (error) {
    console.error("[PDFReport] PDF Sharing failed:", error);
    throw error;
  }
}
