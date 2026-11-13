// Time Arithmetic & Smart CSV Parser ("Outubro.csv")
function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function formatMinutes(m, withSign = true) {
  if (m === null || isNaN(m)) return '--:--';
  const isNeg = m < 0;
  const abs = Math.abs(m);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const sign = isNeg ? '-' : (withSign ? '+' : '');
  return `${sign}${pad(hours)}:${pad(mins)}`;
}

function calculateDailyWorked(in1, out1, in2, out2) {
  const t_in1 = parseTime(in1);
  const t_out1 = parseTime(out1);
  const t_in2 = parseTime(in2);
  const t_out2 = parseTime(out2);

  let total = 0;
  if (t_in1 !== null && t_out1 !== null && t_out1 >= t_in1) total += (t_out1 - t_in1);
  if (t_in2 !== null && t_out2 !== null && t_out2 >= t_in2) total += (t_out2 - t_in2);
  return total;
}

function getWeekdayName(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return '';
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return days[d.getDay()] || '';
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function parseTimecardContent(text) {
  text = text.trim();
  if (!text) return [];

  // Check JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : (json.entries || []);
      return list.map(it => ({
        date: it.date,
        in1: it.in1 || null,
        out1: it.out1 || null,
        in2: it.in2 || null,
        out2: it.out2 || null,
        status: it.status || 'Registrado',
        double_hours: !!it.double_hours
      }));
    } catch(e) {}
  }

  // CSV / TSV Parsing
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  const timeRegex = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
  const dateBRRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;
  const dateISORegex = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/;
  const dayWeekdayRegex = /(?:^|,)\s*(\d{1,2})\s*,\s*(SEG|TER|QUA|QUI|SEX|SAB|DOM)\b/i;

  // Attempt to detect year-month from text or default to current (e.g. 2026-10)
  let inferredYearMonth = '2026-10';
  const ymMatch = text.match(/\b(0[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (ymMatch) {
    inferredYearMonth = `${ymMatch[2]}-${ymMatch[1]}`;
  }

  for (const line of lines) {
    // Ignore report headers with general info
    if (/^(cargo|localiza|cpf|categoria|hor[aá]rios:|,,,,dt,sem)/i.test(line)) {
      continue;
    }

    let isoDate = null;
    const matchBR = line.match(dateBRRegex);
    if (matchBR) {
      const day = matchBR[1].padStart(2, '0');
      const month = matchBR[2].padStart(2, '0');
      let year = matchBR[3];
      if (year.length === 2) year = '20' + year;
      isoDate = `${year}-${month}-${day}`;
    } else {
      const matchISO = line.match(dateISORegex);
      if (matchISO) {
        isoDate = `${matchISO[1]}-${matchISO[2].padStart(2, '0')}-${matchISO[3].padStart(2, '0')}`;
      } else {
        // Try day,weekday format as in punto.csv (e.g. ,,,,,01,QUI,0735, ...)
        const matchDW = line.match(dayWeekdayRegex);
        if (matchDW) {
          const day = matchDW[1].padStart(2, '0');
          isoDate = `${inferredYearMonth}-${day}`;
        }
      }
    }

    if (!isoDate) continue;

    // Detect status tag if present in line
    let tag = '';
    if (/cr[eé]dito\s+banco/i.test(line)) tag = 'Crédito Banco de Horas';
    else if (/d[eé]bito\s+banco/i.test(line)) tag = 'Débito Banco de Horas';
    else if (/compensado/i.test(line)) tag = 'Compensado';
    else if (/dsr/i.test(line)) tag = 'DSR';
    else if (/feriado/i.test(line)) tag = 'Feriado';

    const times = line.match(timeRegex) || [];

    // Skip only if there are neither times nor any recognized non-working tag
    if (times.length === 0 && !tag) continue;

    const existingIdx = results.findIndex(it => it.date === isoDate);
    const entryData = {
      date: isoDate,
      in1: times[0] || null,
      out1: times[1] || null,
      in2: times[2] || null,
      out2: times[3] || null,
      status: tag || (times.length >= 2 ? 'Registrado' : 'Folga'),
      double_hours: false
    };

    if (existingIdx >= 0) {
      results[existingIdx] = entryData;
    } else {
      results.push(entryData);
    }
  }

  // Sort by date ascending
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}
