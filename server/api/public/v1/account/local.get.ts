import { getLocalAccountCatalog } from '~/server/utils/local-account-catalog';

export default defineEventHandler(async () => {
  const list = await getLocalAccountCatalog();
  return {
    base_resp: {
      ret: 0,
      err_msg: 'ok',
    },
    total: list.length,
    list,
  };
});
