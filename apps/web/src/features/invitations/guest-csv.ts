export type GuestInput = { name: string; group: string };
/** RFC 4180 quoting, UTF-8 BOM and CRLF; names may contain commas and quotes. */
export function parseGuestCsv(text: string): GuestInput[] {
  if (text.length > 500_000)
    throw new Error('Tệp CSV quá lớn. Tối đa 1.000 khách mỗi lần.');
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
    } else if (ch === '"') {
      if (field || closed)
        throw new Error('CSV có dấu ngoặc kép không hợp lệ.');
      quoted = true;
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (ch !== ',') {
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new Error('CSV có dữ liệu sau dấu ngoặc kép đóng.');
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV chưa đóng dấu ngoặc kép.');
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  const header = rows.shift()?.map((value) => value.trim().toLowerCase());
  if (
    !header ||
    !['name', 'tên', 'tên khách'].includes(header[0]) ||
    header.length > 2 ||
    (header[1] && !['group', 'nhóm'].includes(header[1]))
  )
    throw new Error('CSV cần tiêu đề name,group (Tên,Nhóm).');
  if (!rows.length || rows.length > 1000)
    throw new Error('Nhập từ 1 đến 1.000 khách mỗi lần.');
  return rows.map((values, index) => {
    const name = values[0]?.trim() ?? '',
      group = values[1]?.trim() ?? '';
    if (
      values.length > 2 ||
      !name ||
      [...name].length > 120 ||
      [...group].length > 120 ||
      /[\0\uD800-\uDFFF]/u.test(name + group)
    )
      throw new Error(
        `Dòng ${index + 2}: tên và nhóm tối đa 120 ký tự, tên không được trống.`,
      );
    return { name, group };
  });
}
