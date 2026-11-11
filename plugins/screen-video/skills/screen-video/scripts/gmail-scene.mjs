// A Gmail look-alike inbox for walkthroughs that start from an email. Serve it with mountGmail();
// the email body is whatever HTML you pass (ideally the app's real rendered template).
const icon = (name, extra = '') => `<span class="ms ${extra}">${name}</span>`;

const FILLER = [
  { from: 'Team Calendar', subject: 'Weekly planning moved to Thursday', snippet: 'The planning sync now starts at 10:00 AM in the main room…', time: '8:12 AM' },
  { from: 'IT Help Desk', subject: 'Scheduled maintenance this weekend', snippet: 'Email and VPN may be unavailable Saturday from 1–3 AM…', time: 'Oct 13' },
  { from: 'Payroll', subject: 'Your October pay stub is ready', snippet: 'Sign in to the HR portal to view your latest pay stub…', time: 'Oct 12' },
  { from: 'Facilities', subject: 'Parking lot resurfacing next week', snippet: 'Please park in the north lot from Monday to Friday…', time: 'Oct 11' },
  { from: 'Company Newsletter', subject: 'This week at the office', snippet: 'Highlights: new hires, the offsite agenda, lunch-and-learn…', time: 'Oct 10' },
];

/**
 * Ids for the flow: #row-email (the message in the list), #folder-inbox, #folder-spam,
 * #sender-addr, #mail (the iframe holding the email), and the reply: #reply-btn, #reply-text,
 * #send-btn. After Send, `window.__sent` is true and the reply shows under the email.
 */
export function gmailHtml({
  emailHtml,
  subject,
  snippet = '',
  sender, // { name, address, initial?, bg?, fg? }
  me = { email: 'you@example.com', initial: 'Y' },
  time = '9:41 AM',
  rows = FILLER,
  open = false,
  mailbox = '',
}) {
  const base = mailbox ? `/${mailbox}` : '';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const email = emailHtml.replaceAll('target="_blank"', 'target="_top"');
  const all = [{ from: sender.name, subject, snippet, time, unread: true, id: 'email' }, ...rows];
  const list = `
    <div class="toolbar">${icon('check_box_outline_blank')}${icon('refresh')}${icon('more_vert')}<span class="count">1–${all.length} of ${all.length}</span></div>
    <div class="tabs"><div class="tab on">${icon('inbox')}Primary</div><div class="tab">${icon('sell')}Promotions</div><div class="tab">${icon('group')}Social</div></div>
    ${all
      .map(
        (
          r,
        ) => `<a class="row${r.unread ? ' unread' : ''}" ${r.id ? `id="row-${r.id}" href="${base}/message"` : ''}>
          ${icon('check_box_outline_blank', 'dim')}${icon('star', 'dim')}
          <span class="from">${esc(r.from)}</span>
          <span class="subj"><b>${esc(r.subject)}</b><span class="snip"> - ${esc(r.snippet)}</span></span>
          <span class="time">${r.time}</span></a>`,
      )
      .join('')}`;
  const message = `
    <div class="toolbar">${icon('arrow_back')}${icon('archive')}${icon('report')}${icon('delete')}${icon('mail')}${icon('more_vert')}</div>
    <div class="msg">
      <h1>${esc(subject)} <span class="label">Inbox ×</span></h1>
      <div class="sender">
        <div class="avatar" style="background:${sender.bg ?? '#5f6368'};color:${sender.fg ?? '#fff'}">${esc(sender.initial ?? sender.name[0])}</div>
        <div><div><b>${esc(sender.name)}</b> <span class="addr" id="sender-addr">&lt;${esc(sender.address)}&gt;</span></div>
        <div class="to">to me ${icon('arrow_drop_down', 'tiny')}</div></div>
        <div class="when">${time} (2 minutes ago) ${icon('star', 'dim')}${icon('reply', 'dim')}${icon('more_vert', 'dim')}</div>
      </div>
      <iframe id="mail" scrolling="no" srcdoc="${esc(email)}"></iframe>
      <div class="actions"><button class="pill" id="reply-btn">${icon('reply', 'tiny')} Reply</button><button class="pill">${icon('forward', 'tiny')} Forward</button></div>
      <div class="reply"><div class="hdr">${icon('reply', 'tiny')} ${esc(sender.name)} (${esc(sender.address)})</div>
        <textarea id="reply-text"></textarea>
        <div class="bar"><button class="send" id="send-btn">Send</button>${icon('format_color_text', 'dim')}${icon('attach_file', 'dim')}${icon('link', 'dim')}${icon('mood', 'dim')}${icon('delete', 'dim')}</div></div>
      <div class="sent"><div class="sender">
        <div class="avatar" style="background:#1a73e8;color:#fff">${esc(me.initial)}</div>
        <div><div><b>${esc(me.name ?? me.email)}</b></div><div class="to">to ${esc(sender.name)}</div></div>
        <div class="when">now</div></div><div class="body" id="sent-body"></div></div>
    </div>
    <div class="toast">Message sent <span>Undo</span><span>View message</span></div>
    <script>
      const f = document.getElementById('mail');
      const fit = () => { try { const h = f.contentDocument.documentElement.scrollHeight; if (h > 50) f.style.height = h + 'px'; } catch {} };
      f.addEventListener('load', fit); setInterval(fit, 200);
      document.getElementById('reply-btn').onclick = () => {
        document.body.classList.add('replying');
        document.getElementById('reply-text').focus();
        document.querySelector('.reply').scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      document.getElementById('send-btn').onclick = () => {
        document.getElementById('sent-body').textContent = document.getElementById('reply-text').value;
        document.body.classList.add('done');
        window.__sent = true;
      };
    </script>`;
  const nav = [
    ['inbox', 'Inbox', '1', 'inbox', open ? '' : 'on'],
    ['star', 'Starred'],
    ['schedule', 'Snoozed'],
    ['send', 'Sent'],
    ['draft', 'Drafts'],
    ['report', 'Spam', '', 'spam'],
    ['expand_more', 'More'],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Inbox (1) - ${esc(me.email)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block">
  <style>
    *{box-sizing:border-box} html,body{height:100%}
    body{margin:0;font:14px/20px Roboto,Arial,sans-serif;color:#1f1f1f;background:#f6f8fc;display:grid;grid-template-rows:64px 1fr;grid-template-columns:256px 1fr}
    .ms{font-family:'Material Symbols Outlined';font-size:20px;line-height:1;color:#444746;display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;flex:none}
    .ms.dim{color:#c4c7c5;width:28px;height:28px;font-size:20px} .ms.tiny{width:16px;height:16px;font-size:18px;vertical-align:middle}
    header{grid-column:1/3;display:flex;align-items:center;padding:8px 16px 8px 12px;gap:8px}
    .brand{display:flex;align-items:center;gap:6px;width:222px;font-size:22px;color:#5f6368}
    .search{flex:1;max-width:720px;height:48px;background:#e9eef6;border-radius:24px;display:flex;align-items:center;padding:0 6px;color:#444746;font-size:16px}
    .search .ph{flex:1;padding-left:4px}
    .right{margin-left:auto;display:flex;align-items:center;gap:2px}
    .me{width:32px;height:32px;border-radius:50%;background:#1a73e8;color:#fff;display:grid;place-items:center;font-weight:500;margin-left:8px}
    nav{padding:8px 16px 0 0}
    .compose{margin:0 0 16px 8px;height:56px;width:140px;border-radius:16px;background:#c2e7ff;display:flex;align-items:center;gap:6px;padding:0 20px 0 10px;font-weight:500;color:#001d35}
    .compose .ms{color:#001d35}
    .folder{height:32px;border-radius:0 16px 16px 0;display:flex;align-items:center;padding:0 12px 0 14px;color:#202124}
    .folder .ms{width:20px;height:20px;margin-right:18px} .folder .n{margin-left:auto;font-size:12px;font-weight:700}
    .folder.on{background:#d3e3fd;font-weight:700} .folder.on .ms{color:#041e49}
    main{background:#fff;border-radius:16px;margin:0 16px 16px 0;overflow:hidden;display:flex;flex-direction:column}
    .toolbar{height:48px;display:flex;align-items:center;padding:0 8px} .count{margin-left:auto;font-size:12px;color:#5f6368;padding-right:16px}
    .tabs{display:flex;border-bottom:1px solid #f1f3f4} .tab{width:252px;height:52px;display:flex;align-items:center;gap:4px;padding-left:8px;color:#444746;font-weight:500;font-size:14px}
    .tab.on{color:#0b57d0;box-shadow:inset 0 -3px 0 #0b57d0} .tab.on .ms{color:#0b57d0}
    .row{display:flex;align-items:center;height:40px;padding:0 16px 0 10px;border-bottom:1px solid #f1f3f4;color:#444746;text-decoration:none;background:#f2f6fc;cursor:pointer}
    .row.unread{background:#fff;color:#1f1f1f} .row:hover{box-shadow:inset 1px 0 0 #dadce0,inset -1px 0 0 #dadce0,0 1px 2px 0 rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15);position:relative;z-index:1}
    .from{width:168px;flex:none;padding-left:6px} .row.unread .from{font-weight:700}
    .subj{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .row b{font-weight:400} .row.unread b{font-weight:700}
    .snip{color:#5f6368} .time{width:72px;text-align:right;font-size:12px;flex:none} .row.unread .time{font-weight:700}
    .msg{padding:0 24px 24px 72px;flex:1;min-height:0;overflow:auto}
    .msg h1{font-size:22px;line-height:28px;font-weight:400;margin:12px 0 18px} .label{font-size:12px;background:#ddd;border-radius:4px;padding:0 4px;color:#444;vertical-align:middle}
    .sender{display:flex;align-items:center;gap:12px;margin:0 0 8px -56px}
    .avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:18px}
    .sender b{font-weight:700;font-size:14px} .addr{color:#5f6368;font-size:12px} .to{color:#5f6368;font-size:12px}
    .when{margin-left:auto;color:#5f6368;font-size:12px;display:flex;align-items:center}
    iframe{border:0;width:100%;display:block;height:560px}
    .actions{display:flex;gap:8px;margin:16px 0 0}
    .pill{display:flex;align-items:center;gap:4px;height:36px;border:1px solid #747775;border-radius:18px;padding:0 16px 0 10px;color:#444746;background:#fff;font:500 14px Roboto,Arial,sans-serif;cursor:pointer}
    .reply{display:none;margin:16px 0 0;border-radius:16px;box-shadow:0 1px 2px 0 rgba(60,64,67,.3),0 2px 6px 2px rgba(60,64,67,.15);padding:12px 16px}
    body.replying .reply{display:block} body.replying .actions{display:none}
    .reply .hdr{color:#444746;font-size:14px;display:flex;align-items:center;gap:6px;margin-bottom:6px}
    .reply textarea{width:100%;border:0;outline:0;resize:none;font:14px/20px Roboto,Arial,sans-serif;min-height:96px;color:#1f1f1f}
    .reply .bar{display:flex;align-items:center;gap:2px}
    .send{background:#0b57d0;color:#fff;border:0;border-radius:18px;height:36px;padding:0 24px;font:500 14px Roboto,Arial,sans-serif;cursor:pointer;margin-right:8px}
    .sent{display:none;margin:16px 0 0;border-top:1px solid #f1f3f4;padding-top:16px}
    body.done .sent{display:block} body.done .reply{display:none}
    .sent .sender{margin-left:-56px} .sent .body{font-size:14px;margin-top:4px}
    .toast{position:fixed;left:24px;bottom:24px;display:flex;gap:24px;background:#1f1f1f;color:#f2f2f2;padding:14px 24px;border-radius:4px;opacity:0;transition:opacity .3s;font-size:14px}
    .toast span{color:#a8c7fa;font-weight:500} body.done .toast{opacity:1}
  </style></head><body>
    <header>
      ${icon('menu')}
      <div class="brand"><svg width="40" height="30" viewBox="52 42 88 66"><path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/><path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/><path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/><path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/><path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/></svg>Gmail</div>
      <div class="search">${icon('search')}<span class="ph">Search mail</span>${icon('tune')}</div>
      <div class="right">${icon('help')}${icon('settings')}${icon('apps')}<div class="me">${esc(me.initial)}</div></div>
    </header>
    <nav><div class="compose">${icon('edit')}Compose</div>
      ${nav.map(([ic, label, n = '', id = '', on = '']) => `<div class="folder ${on}" ${id ? `id="folder-${id}"` : ''}>${icon(ic)}<span>${label}</span><span class="n">${n}</span></div>`).join('')}
    </nav>
    <main>${open ? message : list}</main>
  </body></html>`;
}

/**
 * Serves the scene at http://mail.localhost/<mailbox> (list) and /<mailbox>/message (open
 * email). Mount once per mailbox for several people's inboxes. Call before page.goto, then
 * `await page.evaluate(() => document.fonts.ready)` so icons never pop in.
 */
export async function mountGmail(page, opts) {
  const base = opts.mailbox ? `/${opts.mailbox}` : '';
  await page.route('http://mail.localhost/**', (r) => {
    const path = new URL(r.request().url()).pathname.replace(/\/$/, '');
    if (path !== base && path !== `${base}/message`) return r.fallback();
    return r.fulfill({
      contentType: 'text/html',
      body: gmailHtml({ ...opts, open: path === `${base}/message` }),
    });
  });
}
