/**
 * 退出登录接口
 */

import dayjs from 'dayjs';
import { parseCookies, setCookie } from 'h3';
import { cookieStore, getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';

export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    return { statusCode: 401, statusText: '未登录或登录已过期，请重新扫码登录' };
  }

  const response: Response = await proxyMpRequest({
    event: event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/logout',
    query: {
      t: 'wxm-logout',
      token: token,
      lang: 'zh_CN',
    },
  });

  // 登出后清理内存中的 cookie 缓存
  const authKey = getRequestHeader(event, 'X-Auth-Key') || parseCookies(event)['auth-key'];
  if (authKey) {
    cookieStore.removeCookie(authKey);
  }

  setCookie(event, 'auth-key', 'EXPIRED', {
    path: '/',
    expires: dayjs().subtract(1, 'day').toDate(),
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  });

  return {
    statusCode: response.status,
    statusText: response.statusText,
  };
});
