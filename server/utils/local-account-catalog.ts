import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_EXPORT_ROOT = path.resolve(process.cwd(), 'output');
const DEFAULT_KV_COOKIE_ROOT = path.resolve(process.cwd(), '.data/kv/cookie');
const ARTICLE_FILE_EXTENSIONS = new Set(['.md', '.markdown', '.html', '.htm', '.json', '.txt']);
const BIZ_PATTERN = /__biz=([A-Za-z0-9+/=]+)(?:[&#]|$)/;

export interface LocalAccountCatalogItem {
  fakeid: string;
  nickname: string;
  round_head_img: string;
  service_type: number;
  signature: string;
  verify_status: number;
  alias: string;
  type: 'account';
  articles: number;
  directory: string;
}

function getExportRoot() {
  return process.env.MP_EXPORT_ROOT || DEFAULT_EXPORT_ROOT;
}

function getCookieRoot() {
  return process.env.MP_COOKIE_ROOT || DEFAULT_KV_COOKIE_ROOT;
}

async function listAccountDirectories(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !name.startsWith('.') && name !== 'index' && name !== 'search_sogou')
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

async function listArticleFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => !name.startsWith('.') && ARTICLE_FILE_EXTENSIONS.has(path.extname(name).toLowerCase()));
}

async function extractFakeidFromDirectory(dir: string, files: string[]) {
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const content = await readFile(filePath, 'utf8');
      const match = content.match(BIZ_PATTERN);
      if (match?.[1]) {
        return match[1];
      }
    } catch {
      // Skip unreadable files and continue scanning the rest.
    }
  }

  return null;
}

export async function getLocalAccountCatalog(): Promise<LocalAccountCatalogItem[]> {
  const root = getExportRoot();
  const accountDirectories = await listAccountDirectories(root);
  const items: LocalAccountCatalogItem[] = [];
  const searchContext = await getSearchContext();

  for (const accountName of accountDirectories) {
    const fullDir = path.join(root, accountName);
    const files = await listArticleFiles(fullDir);

    const directFakeid = await extractFakeidFromDirectory(fullDir, files);
    const resolved = directFakeid
      ? {
          fakeid: directFakeid,
          alias: '',
          round_head_img: '',
          service_type: 0,
          signature: '',
          verify_status: 0,
        }
      : await resolveAccountByNickname(accountName, searchContext);
    const fakeid = resolved?.fakeid;
    if (!fakeid) {
      continue;
    }

    items.push({
      type: 'account',
      fakeid,
      nickname: accountName,
      alias: resolved?.alias || '',
      round_head_img: resolved?.round_head_img || '',
      service_type: resolved?.service_type || 0,
      signature: resolved?.signature || '',
      verify_status: resolved?.verify_status || 0,
      articles: files.length,
      directory: fullDir,
    });
  }

  return items;
}

interface SearchContext {
  token: string;
  cookie: string;
}

interface ResolvedAccount {
  fakeid: string;
  alias: string;
  round_head_img: string;
  service_type: number;
  signature: string;
  verify_status: number;
}

async function getSearchContext(): Promise<SearchContext | null> {
  const cookieRoot = getCookieRoot();
  const entries = await readdir(cookieRoot, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
      .map(async entry => {
        const fullPath = path.join(cookieRoot, entry.name);
        const fileStat = await stat(fullPath);
        return { fullPath, mtimeMs: fileStat.mtimeMs };
      })
  );

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(file.fullPath, 'utf8'));
      const token = raw?.token;
      const cookies = Array.isArray(raw?.cookies) ? raw.cookies : [];
      const cookie = cookies
        .filter((item: Record<string, string>) => item?.name && item?.value && item.value !== 'EXPIRED')
        .map((item: Record<string, string>) => `${item.name}=${item.value}`)
        .join('; ');
      if (token && cookie) {
        return { token, cookie };
      }
    } catch {
      // Ignore malformed cookie files.
    }
  }

  return null;
}

async function resolveAccountByNickname(
  nickname: string,
  context: SearchContext | null
): Promise<ResolvedAccount | null> {
  if (!context) {
    return null;
  }

  const params = new URLSearchParams({
    action: 'search_biz',
    begin: '0',
    count: '10',
    query: nickname,
    token: context.token,
    lang: 'zh_CN',
    f: 'json',
    ajax: '1',
  });

  try {
    const resp = await fetch(`https://mp.weixin.qq.com/cgi-bin/searchbiz?${params.toString()}`, {
      headers: {
        Cookie: context.cookie,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const data = await resp.json();
    if (data?.base_resp?.ret !== 0 || !Array.isArray(data?.list)) {
      return null;
    }

    const exact = data.list.find((item: Record<string, string>) => item.nickname === nickname) || data.list[0];
    if (!exact?.fakeid) {
      return null;
    }

    return {
      fakeid: exact.fakeid,
      alias: exact.alias || '',
      round_head_img: exact.round_head_img || '',
      service_type: exact.service_type || 0,
      signature: exact.signature || '',
      verify_status: exact.verify_status || 0,
    };
  } catch {
    return null;
  }
}
