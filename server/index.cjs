'use strict';
const { config } = require('./config.cjs');
const { Store } = require('./store.cjs');
const { Auth } = require('./auth.cjs');
const { mailer } = require('./mail.cjs');
const { createStudio } = require('./studio.cjs');
const { createHttp } = require('./http.cjs');
async function main() {
    if (process.env.COLLAB_OWNER_LOCK !== '1')
        throw new Error('Start through npm run collab (single-owner lock).');
    process.umask(0o077);
    const settings = config();
    const validate = require('../electron/validation.cjs');
    const store = await Store.open(settings.stateDirectory, { validateEnvelope: validate.envelope });
    if (require('node:fs').existsSync(require('node:path').join(settings.stateDirectory,'collab.sqlite')) &&
        !(await store.db.query('SELECT count(*) AS n FROM migration_receipts')).rows[0].n) {
      await store.close(); throw new Error('Legacy SQLite exists; explicitly import it before starting PostgreSQL mode.');
    }
    await store.db.ownWorkspace();
    store.context = {appRelease: settings.release};
    const auth = new Auth(store, { origin: settings.origin, secure: settings.secure, sendMail: mailer(settings.python) });
    let http, runtime;
    try {
        runtime = await createStudio(settings, store, event => http?.emit(event));
        http = createHttp({ config: settings, store, auth, runtime });
        await new Promise((resolve, reject) => { http.server.once('error', reject); http.server.listen(settings.port, settings.host, resolve); });
        console.log('Pydicate collaboration server ready on ' + settings.host + ':' + settings.port);
    }
    catch (error) {
        await runtime?.close();
        await store.close();
        throw error;
    }
    let stopping = false, digestTask = null;
    const digestTimer=setInterval(()=>{
      if(stopping || digestTask || !['hourly','daily'].includes(process.env.COLLAB_DIGEST_MODE))return;
      digestTask=require('./digests.cjs').sendDigests(store,auth.sendMail,{mode:process.env.COLLAB_DIGEST_MODE,origin:settings.origin})
        .catch(()=>{console.error('Merge digest failed; pending notifications preserved.');}).finally(()=>{digestTask=null;});
    },60000);digestTimer.unref();
    async function stop() {
        if (stopping)
            return;
        stopping = true;clearInterval(digestTimer);
        const deadline = setTimeout(() => process.exit(1), 70000);
        deadline.unref();
        await http.close();
        await runtime.close();
        await Promise.allSettled([...auth.deliveries]);
        if(digestTask)await digestTask;
        await store.close();
        clearTimeout(deadline);
    }
    for (const signal of ['SIGTERM', 'SIGINT'])
        process.on(signal, () => void stop().catch(() => process.exit(1)));
}
main().catch(() => { console.error('Collaboration startup failed. Check the configured workspace, dependencies, database permissions and port. No credentials or request bodies are logged.'); process.exitCode = 1; });
