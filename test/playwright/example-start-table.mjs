// RELEASE, as a fresh user gets it, in whatever language LANG_CODE says.
// Nothing is injected - this exercises the code release actually serves.
export default async function ({ page, say }) {
  const L = process.env.LANG_CODE || 'en';
  const out = { lang: L };
  await page.goto('https://www.bridgebase.com/v3/app/lv', { waitUntil: 'domcontentloaded' });
  await page.evaluate(l => { localStorage.removeItem('PBSCache'); localStorage.removeItem('BBOalertCache'); localStorage.setItem('lang', l); }, L);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(11000);
  out.nav = await page.evaluate(() => [...document.querySelectorAll('button.bbo-phx-navigation')]
    .filter(b=>b.offsetParent).slice(0,3).map(b=>(b.textContent||'').trim().slice(0,18)));
  let ready=false;
  for (let i=0;i<22&&!ready;i++){ await page.waitForTimeout(1000);
    ready = await page.evaluate(()=>{const f=document.getElementById('pbs-iframe'),d=f&&f.contentDocument;
      return !!(d&&[...d.querySelectorAll('button')].some(b=>b.textContent.trim()==='Basic 1M (Major)'));}).catch(()=>false); }
  out.ready = ready;
  say('lang=' + L + ' nav=' + JSON.stringify(out.nav) + ' panel=' + ready);
  if (!ready) return out;

  const logs=[];
  page.on('console', m=>{const t=m.text(); if(/startTable|navButton|seat directions/.test(t)) logs.push(t.slice(0,150));});
  await page.evaluate(() => {
    const d = document.getElementById('pbs-iframe').contentDocument;
    const b = [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Strt Bid Tbl');
    if (b) b.click();
  });
  for (let i=0;i<30 && !logs.some(l=>/DONE|FAILED/.test(l)); i++) await page.waitForTimeout(1000);
  await page.waitForTimeout(2000);
  out.logs = logs;
  out.seats = await page.evaluate(()=>[...document.querySelectorAll('bridge-screen .nameDisplayClass')].map(n=>n.textContent.trim()));
  out.filled = out.seats.filter(s => s && !/ - /.test(s)).length;
  say('logs: ' + JSON.stringify(logs));
  say('seats: ' + JSON.stringify(out.seats));
  await page.evaluate(()=>localStorage.setItem('lang','en'));
  return out;
}
