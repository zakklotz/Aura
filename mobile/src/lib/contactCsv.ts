import Papa from "papaparse";

type ParsedContactRow = {
  displayName: string;
  numbers: string[];
  notes?: string;
};

type ParsedCsvResult = {
  rows: ParsedContactRow[];
  skippedRows: number;
};

const NAME_HEADERS = ["name", "full_name", "display_name"];
const FIRST_NAME_HEADERS = ["first_name", "firstname", "first"];
const LAST_NAME_HEADERS = ["last_name", "lastname", "last"];
const PHONE_HEADERS = ["phone", "phone_number", "mobile", "cell", "number"];
const NOTES_HEADERS = ["notes", "note"];

function normalizeKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

function getFirstValue(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value?.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildDisplayName(record: Record<string, string>): string {
  const direct = getFirstValue(record, NAME_HEADERS);
  if (direct) {
    return direct;
  }

  const first = getFirstValue(record, FIRST_NAME_HEADERS);
  const last = getFirstValue(record, LAST_NAME_HEADERS);
  return `${first} ${last}`.trim();
}

function buildPhoneNumbers(record: Record<string, string>): string[] {
  const values = PHONE_HEADERS.flatMap((key) => {
    const raw = record[key];
    if (!raw) {
      return [];
    }
    return raw
      .split(/[;|/]/)
      .map((item) => normalizePhone(item))
      .filter((item): item is string => Boolean(item));
  });

  return [...new Set(values)];
}

export function parseContactCsv(source: string): ParsedCsvResult {
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: ParsedContactRow[] = [];
  let skippedRows = 0;

  for (const rawRow of parsed.data) {
    const normalizedRecord = Object.fromEntries(
      Object.entries(rawRow ?? {}).map(([key, value]) => [normalizeKey(key), String(value ?? "").trim()])
    );
    const displayName = buildDisplayName(normalizedRecord);
    const numbers = buildPhoneNumbers(normalizedRecord);
    const notes = getFirstValue(normalizedRecord, NOTES_HEADERS);

    if (!displayName || numbers.length === 0) {
      skippedRows += 1;
      continue;
    }

    rows.push({
      displayName,
      numbers,
      notes: notes || undefined,
    });
  }

  return {
    rows,
    skippedRows,
  };
}
