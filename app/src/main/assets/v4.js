/* ===================== v4: לוח שנה עברי-לועזי, זמנים לפי מיקום, יבוא PDF/Excel, סיסמה, ועוד ===================== */
(function () {
    'use strict';
    const G = window;
    const hc = G.hebcal;
    const DOW_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const DOW_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    const LAYERS = [
        ['shabbat', '✡ שבתות ופרשות'], ['holidays', '🎉 חגים ומועדים'], ['times', '⏱ זמנים (נרות, צומות)'],
        ['yahrtzeit', '🕯 יארצייט'], ['custom', '✏ האירועים שלי']
    ];
    const el = id => document.getElementById(id);
    const cur = () => dbSynagogues[currentSynagogueKey];
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const noon = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    const isoToDate = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
    const save = () => { try { persistDB(); } catch (e) {} };
    const escH = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ---------- ברירות מחדל ---------- */
    const _ed = G.ensureDefaults;
    G.ensureDefaults = function (sh) {
        _ed(sh);
        if (!sh) return;
        if (!sh.loc) sh.loc = { name: 'ירושלים', cc: 'IL', lat: 31.769, lon: 35.216, tzid: 'Asia/Jerusalem', mins: 40 };
        if (typeof sh.showZmanSlide !== 'boolean') sh.showZmanSlide = true;
        if (!sh.calLayers) sh.calLayers = { shabbat: true, holidays: true, times: true, yahrtzeit: true, custom: true };
        if (!sh.calBoard) sh.calBoard = { title: 'לוח שנה עברי', layers: { shabbat: true, holidays: true, times: true, yahrtzeit: false, custom: true }, upcoming: true, bg: '' };
        if (!Array.isArray(sh.calEvents)) sh.calEvents = [];
        if (!sh.slidesConfig.calendar) sh.slidesConfig.calendar = { name: 'לוח שנה עברי', active: false, duration: 10, order: 6 };
    };
    Object.keys(dbSynagogues).forEach(k => G.ensureDefaults(dbSynagogues[k]));

    /* ============================================================
       מנוע אירועים (חגים, פרשות, זמנים) - עובד בלי אינטרנט
       ============================================================ */
    const rangeCache = new Map();
    function hcLoc(sh) { const l = sh.loc; return new hc.Location(l.lat, l.lon, l.cc === 'IL', l.tzid, l.name, l.cc); }
    function classify(e, d) {
        const F = hc.flags, f = e.getFlags(), desc = e.getDesc ? e.getDesc() : '';
        if (e instanceof hc.CandleLightingEvent) return { layer: 'times', cls: 'ev-times', text: 'הדלקת נרות ' + e.eventTimeStr, short: 'נרות ' + e.eventTimeStr, time: e.eventTimeStr, order: 8 };
        if (e instanceof hc.HavdalahEvent) { const lab = d.getDay() === 6 ? 'צאת השבת' : 'צאת החג'; return { layer: 'times', cls: 'ev-times', text: lab + ' ' + e.eventTimeStr, short: (d.getDay() === 6 ? 'צאת שבת ' : 'צאת החג ') + e.eventTimeStr, time: e.eventTimeStr, order: 9 }; }
        if (desc === 'Fast begins') return { layer: 'times', cls: 'ev-fast', text: 'כניסת הצום ' + e.eventTimeStr, short: 'כניסת צום ' + e.eventTimeStr, time: e.eventTimeStr, order: 7 };
        if (desc === 'Fast ends') return { layer: 'times', cls: 'ev-fast', text: 'יציאת הצום ' + e.eventTimeStr, short: 'יציאת צום ' + e.eventTimeStr, time: e.eventTimeStr, order: 9 };
        if (e instanceof hc.TimedEvent) return null;
        if (f & (F.OMER_COUNT | F.MOLAD | F.DAF_YOMI | F.HEBREW_DATE | F.MISHNA_YOMI | F.YERUSHALMI_YOMI | F.NACH_YOMI | F.DAILY_LEARNING | F.YIZKOR)) return null;
        const txt = e.render('he-x-NoNikud');
        if (f & F.PARSHA_HASHAVUA) return { layer: 'shabbat', cls: 'ev-shabbat', text: txt, short: txt, order: 1 };
        if (f & (F.SPECIAL_SHABBAT | F.SHABBAT_MEVARCHIM)) return { layer: 'shabbat', cls: 'ev-shabbat', text: txt, short: txt, order: 2 };
        if (f & (F.MAJOR_FAST | F.MINOR_FAST)) return { layer: 'holidays', cls: 'ev-fast', text: txt, short: txt, order: 3 };
        return { layer: 'holidays', cls: 'ev-holiday', text: txt, short: txt, order: 3 };
    }
    function hcMap(sh, start, end) {
        const l = sh.loc, key = [l.lat, l.lon, l.mins, ymd(start), ymd(end)].join('|');
        if (rangeCache.has(key)) return rangeCache.get(key);
        const map = {};
        try {
            const evs = hc.HebrewCalendar.calendar({ start, end, location: hcLoc(sh), candlelighting: true, sedrot: true, il: l.cc === 'IL', candleLightingMins: Number(l.mins) || 18, noMolad: true, locale: 'he-x-NoNikud' });
            for (const e of evs) {
                const d = e.getDate().greg(), r = classify(e, d);
                if (r) (map[ymd(d)] = map[ymd(d)] || []).push(r);
            }
        } catch (err) { console.error('hebcal', err); }
        if (rangeCache.size > 40) rangeCache.clear();
        rangeCache.set(key, map);
        return map;
    }

    /* ---------- יארצייט ---------- */
    const HMON = { 'ניסן': 1, 'אייר': 2, 'סיוון': 3, 'סיון': 3, 'תמוז': 4, 'אב': 5, 'אלול': 6, 'תשרי': 7, 'חשוון': 8, 'חשון': 8, 'מרחשוון': 8, 'כסלו': 9, 'כסליו': 9, 'טבת': 10, 'שבט': 11, 'אדר': 12, 'אדר א': 12, 'אדר ב': 13 };
    const GEM = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };
    function gem(str) { let n = 0; for (const ch of str) n += GEM[ch] || 0; return n; }
    function parseYahr(y) {
        const clean = s => String(s || '').replace(/["'׳״`]/g, '').replace(/\s+/g, ' ').trim();
        const m = clean(y.date).match(/^([א-ת]{1,3})\s+(.+)$/);
        let day = 0, monTxt = clean(y.month);
        if (m && /^[א-ת]{1,3}$/.test(m[1]) && gem(m[1]) > 0 && gem(m[1]) <= 30) { day = gem(m[1]); if (!HMON[monTxt] || /\s/.test(m[2])) monTxt = clean(m[2]).replace(/^ב/, ''); }
        if (!day) { const mm = clean(y.date).match(/^([א-ת]{1,3})/); if (mm && gem(mm[1]) <= 30) day = gem(mm[1]); }
        let mon = HMON[monTxt] || HMON[clean(y.month)];
        if (!day || !mon) return null;
        return { day, mon, raw: monTxt };
    }
    function yahrMatches(sh, hd) {
        const out = [], leap = hd.isLeapYear();
        (sh.yahrtzeits || []).forEach(y => {
            const p = parseYahr(y); if (!p) return;
            let mon = p.mon;
            if (mon === 12 && /ב/.test(p.raw) && !leap) mon = 12;
            if (mon === 13 && !leap) mon = 12;
            if (mon === 12 && leap && !/א/.test(p.raw) && p.raw === 'אדר') mon = 13;
            if (hd.getMonth() === mon && hd.getDate() === p.day) out.push(y);
        });
        return out;
    }

    /* ---------- אירועי המשתמש ---------- */
    function customOn(sh, date, hd) {
        const out = [];
        (sh.calEvents || []).forEach(ev => {
            const d = isoToDate(ev.date);
            let ok = false;
            if (ev.repeat === 'greg') ok = d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
            else if (ev.repeat === 'heb') { const h0 = new hc.HDate(noon(d)); ok = h0.getMonth() === hd.getMonth() && h0.getDate() === hd.getDate(); }
            else ok = ymd(d) === ymd(date);
            if (ok) out.push(ev);
        });
        return out;
    }

    /* ---------- כל אירועי היום ---------- */
    function dayEvents(sh, date, map, layers, boardOnly) {
        const hd = new hc.HDate(noon(date)), out = [];
        (map[ymd(date)] || []).forEach(e => { if (layers[e.layer]) out.push(e); });
        if (layers.yahrtzeit) yahrMatches(sh, hd).forEach(y => out.push({ layer: 'yahrtzeit', cls: 'ev-yahr', text: '🕯 ' + y.name, short: '🕯 ' + y.name, order: 5 }));
        if (layers.custom) customOn(sh, date, hd).forEach(ev => {
            if (boardOnly && ev.show === false) return;
            out.push({ layer: 'custom', cls: 'ev-custom', text: ev.title + (ev.time ? ' (' + ev.time + ')' : ''), short: (ev.time ? ev.time + ' ' : '') + ev.title, order: 4, evId: ev.id, show: ev.show !== false });
        });
        out.sort((a, b) => a.order - b.order);
        return out;
    }

    /* ---------- מודל חודש ---------- */
    function monthModel(sh, y, m) {
        const lead = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
        const weeks = Math.ceil((lead + dim) / 7), start = new Date(y, m, 1 - lead);
        const cells = [];
        for (let i = 0; i < weeks * 7; i++) cells.push({ date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + i) });
        const map = hcMap(sh, cells[0].date, cells[cells.length - 1].date);
        return { y, m, cells, map };
    }
    function monthTitles(y, m) {
        const a = hebParts(noon(new Date(y, m, 1))), b = hebParts(noon(new Date(y, m + 1, 0)));
        const yrA = new hc.HDate(noon(new Date(y, m, 1))).getFullYear(), yrB = new hc.HDate(noon(new Date(y, m + 1, 0))).getFullYear();
        const hm = hebMonthHe(a.month), hm2 = hebMonthHe(b.month);
        let heb = hm === hm2 ? hm : hm + ' – ' + hm2;
        heb += yrA === yrB ? ' ' + hebYearLetters(yrA) : '';
        const greg = new Date(y, m, 15).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
        return { heb, greg };
    }
    function cellHtml(c, sh, model, layers, board) {
        const d = c.date, inMonth = d.getMonth() === model.m, h = hebParts(noon(d));
        let heb = hebDayLetters(h.day); if (h.day === 1) heb += ' ' + hebMonthHe(h.month);
        const evs = dayEvents(sh, d, model.map, layers, board);
        const max = board ? 3 : 3, shown = evs.slice(0, max);
        const chips = shown.map(e => `<div class="ev ${e.cls}" title="${escH(e.text)}">${escH(e.short)}</div>`).join('');
        const more = evs.length > max ? `<div class="more">+${evs.length - max} נוספים</div>` : '';
        const today = ymd(d) === ymd(new Date()) ? ' today' : '';
        const cls = 'cal-cell' + (inMonth ? '' : ' other') + today + (d.getDay() === 6 ? ' shabbat' : '');
        const inner = `<div class="top"><span class="heb">${escH(heb)}</span><span class="greg">${d.getDate()}</span></div>${chips}${more}`;
        return board ? `<div class="${cls}">${inner}</div>` : `<button type="button" class="${cls}" onclick="openDayModal('${ymd(d)}')">${inner}</button>`;
    }
    function dowHeader(target) {
        target.innerHTML = DOW_FULL.map((n, i) => `<div><span class="dow-full">${n}</span><span class="dow-short">${DOW_SHORT[i]}</span></div>`).join('');
    }

    /* ============================================================
       לוח שנה: ניהול
       ============================================================ */
    let calView = { y: new Date().getFullYear(), m: new Date().getMonth() };
    G.renderMonthlyCalendar = function () { renderAdminCalendar(); };
    function renderAdminCalendar() {
        const sh = cur(); if (!sh || !el('calGrid')) return;
        dowHeader(el('calDow'));
        const model = monthModel(sh, calView.y, calView.m);
        const t = monthTitles(calView.y, calView.m);
        el('calTitle').innerHTML = `${escH(t.heb)}<small>${escH(t.greg)}</small>`;
        el('calGrid').innerHTML = model.cells.map(c => cellHtml(c, sh, model, sh.calLayers, false)).join('');
        document.querySelectorAll('#calLayers .layer-chip').forEach(b => b.classList.toggle('on', !!sh.calLayers[b.dataset.layer]));
        el('calLocName').textContent = sh.loc.name;
    }
    G.calNav = function (d) { calView.m += d; if (calView.m < 0) { calView.m = 11; calView.y--; } if (calView.m > 11) { calView.m = 0; calView.y++; } renderAdminCalendar(); };
    G.calToday = function () { const n = new Date(); calView = { y: n.getFullYear(), m: n.getMonth() }; renderAdminCalendar(); };
    G.toggleCalLayer = function (k) { const sh = cur(); sh.calLayers[k] = !sh.calLayers[k]; save(); renderAdminCalendar(); };

    /* ---------- חלון יום ---------- */
    let dayCur = null;
    G.openDayModal = function (iso) {
        const sh = cur(), d = isoToDate(iso); dayCur = iso;
        const h = hebParts(noon(d));
        el('dayModalTitle').textContent = `יום ${DOW_FULL[d.getDay()]} • ${hebDayLetters(h.day)} ${hebMonthHe(h.month)} • ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
        const map = hcMap(sh, d, d);
        const evs = dayEvents(sh, d, map, { shabbat: true, holidays: true, times: true, yahrtzeit: true, custom: true }, false);
        const body = el('dayModalBody');
        if (!evs.length) body.innerHTML = '<div class="day-empty">אין אירועים ביום זה.</div>';
        else body.innerHTML = evs.map(e => {
            if (e.layer === 'custom') return `<div class="day-row ${e.cls}"><span>${escH(e.text)} ${e.show ? '' : '<small>(לא מוצג בלוח)</small>'}</span><span><button class="row-btn edit" onclick="editCalEvent('${e.evId}')">עריכה</button></span></div>`;
            const lay = { shabbat: 'שבת', holidays: 'חג / מועד', times: 'זמנים', yahrtzeit: 'יארצייט' }[e.layer];
            return `<div class="day-row ${e.cls}"><span>${escH(e.text)}</span><small>${lay}</small></div>`;
        }).join('');
        el('dayModal').style.display = 'flex';
    };
    G.closeDayModal = function () { el('dayModal').style.display = 'none'; };
    G.addEventOnDay = function () { const d = dayCur; closeDayModal(); openCalEventModal(null, d); };

    /* ---------- חלון אירוע ---------- */
    let evEditId = null;
    G.openCalEventModal = function (id, iso) {
        const sh = cur(); evEditId = id || null;
        const ev = id ? sh.calEvents.find(x => x.id === id) : null;
        el('calEvTitleHead').textContent = ev ? '✏ עריכת אירוע' : '✏ אירוע / טקסט חדש';
        el('calEvText').value = ev ? ev.title : '';
        el('calEvDate').value = ev ? ev.date : (iso || ymd(new Date()));
        el('calEvTime').value = ev ? (ev.time || '') : '';
        el('calEvRepeat').value = ev ? ev.repeat : 'none';
        el('calEvShow').checked = ev ? ev.show !== false : true;
        el('calEvDelete').style.display = ev ? '' : 'none';
        el('calEventModal').style.display = 'flex';
    };
    G.editCalEvent = function (id) { closeDayModal(); openCalEventModal(id); };
    G.closeCalEventModal = function () { el('calEventModal').style.display = 'none'; };
    G.saveCalEvent = function () {
        const sh = cur(), title = el('calEvText').value.trim(), date = el('calEvDate').value;
        if (!title) { showToast('נא למלא טקסט', false); el('calEvText').focus(); return; }
        if (!date) { showToast('נא לבחור תאריך', false); return; }
        const data = { title, date, time: el('calEvTime').value, repeat: el('calEvRepeat').value, show: el('calEvShow').checked };
        if (evEditId) Object.assign(sh.calEvents.find(x => x.id === evEditId), data);
        else sh.calEvents.push(Object.assign({ id: 'e' + Date.now().toString(36) + Math.floor(Math.random() * 99) }, data));
        const d = isoToDate(date); calView = { y: d.getFullYear(), m: d.getMonth() };
        closeCalEventModal(); renderAdminCalendar(); save(); showToast('האירוע נשמר');
    };
    G.deleteCalEvent = function () {
        const sh = cur(); if (!evEditId) return;
        sh.calEvents = sh.calEvents.filter(x => x.id !== evEditId);
        closeCalEventModal(); renderAdminCalendar(); save();
    };

    /* ============================================================
       שקופית לוח שנה בלוח
       ============================================================ */
    G.renderCalendarSlide = function () {
        const sh = cur(); if (!sh) return;
        const cb = sh.calBoard, n = new Date();
        const model = monthModel(sh, n.getFullYear(), n.getMonth());
        el('calSlideTitle').textContent = '📅 ' + (cb.title || 'לוח שנה עברי');
        const t = monthTitles(n.getFullYear(), n.getMonth());
        el('calBoardMonth').innerHTML = `${escH(t.heb)}<small>${escH(t.greg)}</small>`;
        dowHeader(el('calBoardDow'));
        el('calBoardGrid').innerHTML = model.cells.map(c => cellHtml(c, sh, model, cb.layers, true)).join('');
        const board = el('calBoard');
        board.classList.toggle('has-bg', !!cb.bg);
        board.style.backgroundImage = cb.bg ? `url(${cb.bg})` : '';
        const side = el('calBoardSide');
        if (cb.upcoming) {
            const start = new Date(n.getFullYear(), n.getMonth(), n.getDate()), end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 30);
            const map = hcMap(sh, start, end), rows = [];
            for (let i = 0; i < 30 && rows.length < 9; i++) {
                const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
                dayEvents(sh, d, map, cb.layers, true).forEach(e => {
                    if (e.layer === 'times' && !/נרות|צום/.test(e.text)) return;
                    if (rows.length < 9) rows.push({ d, e });
                });
            }
            side.style.display = '';
            side.innerHTML = '<h4>בקרוב</h4>' + (rows.map(r => { const h = hebParts(noon(r.d)); return `<div class="up-row ${r.e.cls}"><span>${escH(r.e.text)}</span><span class="d">${DOW_SHORT[r.d.getDay()]} ${hebDayLetters(h.day)} ${hebMonthHe(h.month)}</span></div>`; }).join('') || '<div class="day-empty">אין אירועים קרובים</div>');
        } else side.style.display = 'none';
    };
    G.openCalBoardModal = function () {
        const cb = cur().calBoard;
        el('cbTitle').value = cb.title || '';
        el('cbUpcoming').checked = !!cb.upcoming;
        el('cbLayers').innerHTML = LAYERS.map(([k, label]) => `<button type="button" class="layer-chip l-${k === 'yahrtzeit' ? 'yahr' : k} ${cb.layers[k] ? 'on' : ''}" data-layer="${k}" onclick="this.classList.toggle('on')">${label}</button>`).join('');
        calBgTmp = cb.bg || '';
        el('cbBgInfo').textContent = calBgTmp ? 'נבחרה תמונת רקע' : '';
        el('calBoardModal').style.display = 'flex';
    };
    let calBgTmp = '';
    G.closeCalBoardModal = function () { el('calBoardModal').style.display = 'none'; };
    G.saveCalBoard = function () {
        const cb = cur().calBoard;
        cb.title = el('cbTitle').value.trim() || 'לוח שנה עברי';
        cb.upcoming = el('cbUpcoming').checked;
        document.querySelectorAll('#cbLayers .layer-chip').forEach(b => { cb.layers[b.dataset.layer] = b.classList.contains('on'); });
        cb.bg = calBgTmp;
        save(); closeCalBoardModal(); showToast('הגדרות לוח השנה נשמרו');
    };
    G.onCalBgFile = function (ev) {
        const f = ev.target.files[0]; if (!f) return;
        const img = new Image(), url = URL.createObjectURL(f);
        img.onload = () => {
            const sc = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
            c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            calBgTmp = c.toDataURL('image/jpeg', 0.8); URL.revokeObjectURL(url);
            el('cbBgInfo').textContent = 'התמונה נבחרה – לחצו "שמור"';
        };
        img.src = url; ev.target.value = '';
    };
    G.clearCalBg = function () { calBgTmp = ''; el('cbBgInfo').textContent = 'הרקע יוסר בשמירה'; };

    /* ============================================================
       מיקום וזמני שבת
       ============================================================ */
    const CITIES = G.CITIES || [];
    const regionNames = (() => { try { return new Intl.DisplayNames(['he'], { type: 'region' }); } catch (e) { return null; } })();
    const cName = cc => { try { return (regionNames && regionNames.of(cc)) || cc; } catch (e) { return cc; } };
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ְͯ-ׇ]/g, '');
    const PIN_CC = ['IL', 'US', 'GB', 'CA', 'FR', 'AU', 'AR', 'BR', 'MX', 'RU', 'UA', 'DE', 'ES', 'IT', 'CH', 'BE', 'NL', 'ZA', 'PA', 'MA', 'TR', 'IN', 'CN', 'HU', 'AT', 'SE', 'PL', 'CL', 'CO', 'VE', 'UY'];
    let pickerItems = [], pickerOnPick = null, pickerExtra = null;
    function openPicker(title, items, onPick, extra) {
        pickerItems = items; pickerOnPick = onPick; pickerExtra = extra || null;
        el('pickerTitle').textContent = title; el('pickerSearch').value = '';
        el('pickerModal').style.display = 'flex';
        G.pickerFilter();
    }
    G.closePicker = function () { el('pickerModal').style.display = 'none'; };
    G.pickerFilter = function () {
        const q = norm(el('pickerSearch').value.trim()), list = el('pickerList');
        let html = '', count = 0;
        if (pickerExtra && !q) html += `<button type="button" class="picker-item pinned" onclick="pickerExtraClick()">${pickerExtra.label}</button>`;
        pickerItems.forEach((it, i) => {
            if (count >= 150) return;
            if (q && !norm(it.label + ' ' + (it.sub || '') + ' ' + (it.alt || '')).includes(q)) return;
            html += `<button type="button" class="picker-item ${it.pinned && !q ? 'pinned' : ''}" onclick="pickerPick(${i})"><span>${escH(it.label)}</span><small>${escH(it.sub || '')}</small></button>`;
            count++;
        });
        if (!html) html = '<div class="day-empty">לא נמצאו תוצאות. אפשר להוסיף ישוב ידנית.</div>';
        if (pickerExtra && q) html += `<button type="button" class="picker-item pinned" onclick="pickerExtraClick()">${pickerExtra.label}</button>`;
        list.innerHTML = html;
    };
    G.pickerPick = function (i) { const it = pickerItems[i]; closePicker(); pickerOnPick(it); };
    G.pickerExtraClick = function () { pickerExtra.run(); };

    G.openCountryPicker = function () {
        const ccs = [...new Set(CITIES.map(c => c[1]))];
        const items = ccs.map(cc => ({ label: cName(cc), sub: cc, value: cc, alt: cc, pinned: PIN_CC.indexOf(cc) >= 0 && PIN_CC.indexOf(cc) < 8, rank: PIN_CC.indexOf(cc) >= 0 ? PIN_CC.indexOf(cc) : 999 }));
        items.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'he'));
        openPicker('בחירת אזור / מדינה', items, it => {
            const sh = cur();
            if (sh.loc.cc !== it.value) { const first = CITIES.find(c => c[1] === it.value); if (first) setLocation({ name: first[0], cc: first[1], lat: first[2], lon: first[3] }); }
            openCityPicker();
        });
    };
    G.openCityPicker = function () {
        const sh = cur(), cc = sh.loc.cc;
        const list = CITIES.filter(c => c[1] === cc).map((c, i) => ({ label: c[0], sub: cName(cc), value: c, pinned: i < 8 }));
        openPicker('בחירת עיר / ישוב – ' + cName(cc), list, it => setLocation({ name: it.value[0], cc: it.value[1], lat: it.value[2], lon: it.value[3] }), { label: '➕ הוספת ישוב ידנית (שם + קואורדינטות)', run: manualLocation });
    };
    function manualLocation() {
        const list = el('pickerList'); el('pickerSearch').style.display = 'none';
        list.innerHTML = `<div style="padding:12px; display:flex; flex-direction:column; gap:8px;">
            <label style="font-size:12px; font-weight:700;">שם הישוב</label><input type="text" id="mlName" placeholder="למשל: נוף הרים">
            <label style="font-size:12px; font-weight:700;">קו רוחב (Latitude)</label><input type="text" id="mlLat" inputmode="decimal" placeholder="31.7683">
            <label style="font-size:12px; font-weight:700;">קו אורך (Longitude)</label><input type="text" id="mlLon" inputmode="decimal" placeholder="35.2137">
            <small style="color:var(--text-secondary)">אפשר להעתיק קואורדינטות מ-Google Maps (לחיצה ארוכה על המקום).</small>
            <button type="button" class="btn" style="margin:0; background:var(--primary-color);" onclick="saveManualLocation()">שמור ישוב</button></div>`;
        setTimeout(() => { const i = el('mlName'); if (i) i.focus(); }, 30);
    }
    G.saveManualLocation = function () {
        const name = el('mlName').value.trim(), lat = parseFloat(el('mlLat').value.replace(',', '.')), lon = parseFloat(el('mlLon').value.replace(',', '.'));
        if (!name || isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { showToast('נא למלא שם וקואורדינטות תקינות', false); return; }
        el('pickerSearch').style.display = ''; closePicker();
        setLocation({ name, cc: cur().loc.cc, lat, lon });
    };
    const _cp = G.closePicker; G.closePicker = function () { el('pickerSearch').style.display = ''; _cp(); };
    function setLocation(l) {
        const sh = cur();
        let tz = 'Asia/Jerusalem';
        try { tz = G.tzlookup(l.lat, l.lon); } catch (e) {}
        const jer = /ירושלים|Jerusalem/.test(l.name);
        sh.loc = { name: l.name, cc: l.cc, lat: l.lat, lon: l.lon, tzid: tz, mins: jer ? 40 : 18 };
        rangeCache.clear(); save(); v4Refresh(); showToast('המיקום עודכן: ' + l.name);
    }
    G.onCandleMinsChange = function (v) { const sh = cur(); sh.loc.mins = Math.max(0, Math.min(90, parseInt(v) || 18)); rangeCache.clear(); save(); v4Refresh(); };
    G.onShowZmanSlide = function (v) { cur().showZmanSlide = v; save(); renderShabLine(); };

    function fmtT(d, tz) { return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false }); }
    function shabbatTimes(sh, now) {
        const l = sh.loc, d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), dow = d0.getDay();
        let fri = dow === 6 ? new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - 1) : new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + ((5 - dow + 7) % 7));
        for (let pass = 0; pass < 2; pass++) {
            const sat = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 1);
            const evs = hc.HebrewCalendar.calendar({ start: fri, end: sat, location: hcLoc(sh), candlelighting: true, il: l.cc === 'IL', candleLightingMins: Number(l.mins) || 18, noHolidays: false });
            const cand = evs.find(e => e instanceof hc.CandleLightingEvent && ymd(e.getDate().greg()) === ymd(fri));
            const hav = evs.find(e => e instanceof hc.HavdalahEvent && ymd(e.getDate().greg()) === ymd(sat));
            let rt = null;
            try { const z = new hc.Zmanim(hcLoc(sh), sat, true); const r = z.sunsetOffset(72, true); rt = fmtT(r, l.tzid); } catch (e) {}
            const out = { fri, sat, candle: cand ? cand.eventTimeStr : '—', havdalah: hav ? hav.eventTimeStr : '—', rt: rt || '—' };
            if (dow === 6 && pass === 0 && hav && now > new Date(sat.getFullYear(), sat.getMonth(), sat.getDate(), +hav.eventTimeStr.slice(0, 2), +hav.eventTimeStr.slice(3, 5))) { fri = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 7); continue; }
            return out;
        }
    }
    function renderZmanBox() {
        const sh = cur(), box = el('zmanBox'); if (!sh || !box) return;
        try {
            const t = shabbatTimes(sh, new Date());
            const dl = d => d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
            box.innerHTML = `
                <div class="zman-item"><div class="z-label">🕯 הדלקת נרות שבת</div><div class="z-time">${t.candle}</div><div class="z-date">${dl(t.fri)}</div></div>
                <div class="zman-item"><div class="z-label">✨ צאת השבת</div><div class="z-time">${t.havdalah}</div><div class="z-date">${dl(t.sat)}</div></div>
                <div class="zman-item"><div class="z-label">✨ צאת השבת לפי ר"ת</div><div class="z-time">${t.rt}</div><div class="z-date">72 דקות אחרי השקיעה</div></div>
                <div class="zman-note">הזמנים מחושבים אוטומטית עבור ${escH(sh.loc.name)} (אזור זמן ${escH(sh.loc.tzid)}) ומתעדכנים כל שבוע ובכל שינוי מיקום. צאת השבת: 8.5° מתחת לאופק.</div>`;
        } catch (e) { box.innerHTML = '<div class="zman-note">לא ניתן לחשב זמנים למיקום זה.</div>'; console.error(e); }
    }
    function renderShabLine() {
        const sh = cur(), line = el('lblShabTimesLine'); if (!sh || !line) return;
        if (!sh.showZmanSlide) { line.style.display = 'none'; return; }
        try { const t = shabbatTimes(sh, new Date()); line.innerHTML = `<span>🕯 הדלקת נרות ${t.candle}</span><span>✨ צאת השבת ${t.havdalah}</span><span>ר"ת ${t.rt}</span>`; line.style.display = ''; } catch (e) { line.style.display = 'none'; }
    }

    /* ---------- רענון כללי ---------- */
    function v4Refresh() {
        const sh = cur(); if (!sh) return;
        el('btnPickCountry').textContent = '🌍 ' + cName(sh.loc.cc);
        el('btnPickCity').textContent = '📍 ' + sh.loc.name;
        el('inCandleMins').value = sh.loc.mins;
        el('optShowZmanSlide').checked = !!sh.showZmanSlide;
        renderZmanBox(); renderShabLine(); renderAdminCalendar();
    }
    G.v4Refresh = v4Refresh;
    const _ld = G.loadDataToUI;
    G.loadDataToUI = function () { _ld(); v4Refresh(); };

    /* ---------- שקופיות: הוספה לרשימה הפעילה והצגה ---------- */
    const _bl = G.buildActiveSlidesList;
    G.buildActiveSlidesList = function () {
        _bl();
        const sh = cur(), c = sh.slidesConfig.calendar;
        if (c && c.active) { activeCarouselSlides.push({ id: 'dynSlide_calendar', key: 'calendar', order: c.order || 6 }); activeCarouselSlides.sort((a, b) => a.order - b.order); renderSlideDots(); }
    };
    const _uc = G.updateCarouselDisplay;
    G.updateCarouselDisplay = function () {
        _uc();
        const it = activeCarouselSlides[currentCarouselIndex];
        if (it && it.key === 'calendar') renderCalendarSlide();
        if (it && it.key === 'torah') renderShabLine();
    };

    /* ---------- רענון אוטומטי ---------- */
    let lastDay = ymd(new Date());
    setInterval(() => {
        const t = ymd(new Date());
        if (t !== lastDay) { lastDay = t; rangeCache.clear(); if (currentSynagogueKey) { v4Refresh(); const it = activeCarouselSlides[currentCarouselIndex]; if (it && it.key === 'calendar') renderCalendarSlide(); } }
    }, 60 * 1000);
    setInterval(() => { if (currentSynagogueKey) { renderZmanBox(); renderShabLine(); } }, 30 * 60 * 1000);

    /* ============================================================
       יבוא Excel / PDF
       ============================================================ */
    async function pdfRows(file) {
        if (!G.pdfjsLib) throw new Error('pdf');
        G.pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
        const pdf = await G.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const rows = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const tc = await (await pdf.getPage(p)).getTextContent();
            const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
            items.sort((a, b) => b.y - a.y);
            const lines = [];
            items.forEach(it => { const ln = lines.find(l => Math.abs(l.y - it.y) < 4); if (ln) ln.items.push(it); else lines.push({ y: it.y, items: [it] }); });
            lines.sort((a, b) => b.y - a.y);
            lines.forEach(ln => {
                const heb = (ln.items.map(i => i.s).join('').match(/[֐-׿]/g) || []).length, all = ln.items.map(i => i.s).join('').length;
                const rtl = heb > all / 2;
                ln.items.sort((a, b) => rtl ? b.x - a.x : a.x - b.x);
                const cells = []; let curCell = null, prev = null;
                ln.items.forEach(it => {
                    const gap = prev ? (rtl ? prev.x - (it.x + it.w) : it.x - (prev.x + prev.w)) : 0;
                    if (!curCell || gap > 14) { curCell = it.s.trim(); cells.push(curCell); } else { cells[cells.length - 1] = cells[cells.length - 1] + (gap > 1.5 ? ' ' : '') + it.s.trim(); }
                    prev = it;
                });
                rows.push(cells.map(c => c.trim()).filter(Boolean));
            });
        }
        return rows;
    }
    async function tableFromFile(file) {
        const n = file.name.toLowerCase();
        if (n.endsWith('.pdf')) return pdfRows(file);
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).map(r => r.map(c => String(c).trim()).filter((c, i, a) => c !== '' || i < a.length));
    }
    const isNum = s => /^\d+[.)]?$/.test(String(s).trim());
    const isHeader = (cells, words) => cells.some(c => words.some(w => String(c).includes(w))) && !cells.some(c => /\d{2,}/.test(c) && !words.some(w => c.includes(w)) && false);
    function rowsToPeople(rows) {
        const out = [];
        rows.forEach(r => {
            let c = r.filter(x => String(x).trim() !== ''); while (c.length && isNum(c[0])) c.shift();
            if (!c.length || isHeader(c, ['שם פרטי', 'שם משפחה', 'שם מלא', 'מיקום'])) return;
            if (c.length === 1) { const p = c[0].replace(/^\d+[.)]\s*/, '').trim().split(/\s+/); out.push({ firstName: p[0], lastName: p.slice(1).join(' ') }); }
            else out.push({ firstName: c[0], lastName: c[1] });
        });
        return out.filter(p => p.firstName);
    }
    function rowsToYahr(rows) {
        const out = [];
        rows.forEach(r => {
            let c = r.filter(x => String(x).trim() !== ''); while (c.length && isNum(c[0])) c.shift();
            if (c.length < 3 || isHeader(c, ['שם הנפטר', 'חודש', 'תאריך פטירה', 'שבת אזכרה'])) return;
            // תיקון: אם השם והתאריך התמזגו לתא אחד (קורה ב-PDF), מפרידים לפי תאריך עברי
            const monRe = Object.keys(HMON).sort((a, b) => b.length - a.length).join('|');
            const re = new RegExp('^(.*?)\\s+([א-ת]{1,3}["\'׳״]{0,2}\\s+(?:' + monRe + '))$');
            const fixed = [];
            c.forEach((cell, i) => { const m = i > 0 && !HMON[cell.replace(/["'׳״]/g, '').trim()] ? String(cell).match(re) : null; if (m && fixed.length >= 1) { fixed.push(m[1], m[2]); } else fixed.push(cell); });
            c = fixed.length >= 3 ? fixed : c;
            out.push({ month: c[0], name: c[1], date: c[2] || '', shabbat: c[3] || 'פרשת השבוע' });
        });
        return out;
    }
    function rowsToDonors(rows) {
        const out = [];
        rows.forEach(r => {
            let c = r.filter(x => String(x).trim() !== ''); while (c.length && isNum(c[0])) c.shift();
            if (!c.length || isHeader(c, ['שם התורם', 'הזכות', 'נדבת הלב'])) return;
            out.push({ name: c[0], merit: c[1] || '', amount: c[2] || '' });
        });
        return out;
    }
    function doImport(event, label, conv, apply) {
        const file = event.target.files[0]; if (!file) return;
        event.target.value = '';
        openConfirmModal('ייבוא קובץ', `לייבא ${label} מהקובץ ${file.name}?`, async () => {
            closeConfirmModal();
            try {
                const items = conv(await tableFromFile(file));
                if (!items.length) { showToast('לא נמצאו נתונים בקובץ (ודאו שהמבנה: עמודות או שורות של טקסט)', false); return; }
                apply(items); save(); showToast(`נוספו ${items.length} רשומות`);
            } catch (e) { console.error(e); showToast('קריאת הקובץ נכשלה', false); }
        });
    }
    G.handleFileImport = function (event, listKey) {
        doImport(event, 'שמות', rowsToPeople, items => { const sh = cur(); sh[listKey] = sh[listKey].concat(items); renderAllLists(); populateAllDropdowns(); });
    };
    G.handleYahrtzeitFileImport = function (event) {
        doImport(event, 'אזכרות', rowsToYahr, items => { const sh = cur(); sh.yahrtzeits = sh.yahrtzeits.concat(items); renderAllLists(); updateYahrtzeitDisplay(); renderAdminCalendar(); });
    };
    G.handleDonorsImport = function (event) {
        doImport(event, 'תורמים', rowsToDonors, items => { cur().donors.push(...items); renderDonorsTable(); renderSlidesManagementTable(); });
    };

    /* ============================================================
       הצג סיסמה
       ============================================================ */
    function enhancePasswords() {
        document.querySelectorAll('input[type=password]').forEach(inp => {
            if (inp.dataset.pw) return; inp.dataset.pw = '1';
            const w = document.createElement('span'); w.className = 'pw-wrap';
            inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
            const b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye'; b.textContent = 'הצג'; b.title = 'הצג / הסתר סיסמה';
            b.addEventListener('click', () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.textContent = show ? 'הסתר' : 'הצג'; });
            w.appendChild(b);
        });
    }
    enhancePasswords();
    new MutationObserver(enhancePasswords).observe(document.body, { childList: true, subtree: true });

    /* ============================================================
       אייקון האפליקציה במסך הבית
       ============================================================ */
    G.onRecentsToggle = function (v) {
        if (!v && isNativeApp()) {
            el('optShowInRecents').checked = true;
            openConfirmModal('הסתרת אייקון האפליקציה', 'האייקון יוסתר ממסך הבית ומרשימת האפליקציות. האפליקציה תמשיך לעבוד ותיפתח אוטומטית בהדלקה אם הפעלתם זאת. שימו לב: לפתיחה ידנית יהיה צורך להתקין מחדש את האפליקציה או להפעיל אותה דרך ההפעלה האוטומטית. להסתיר?', () => {
                closeConfirmModal(); device.showInRecents = false; saveDevice(); el('optShowInRecents').checked = false; nativeCall('setShowLauncherIcon', false);
            });
            return;
        }
        device.showInRecents = v; saveDevice(); nativeCall('setShowLauncherIcon', v);
    };


    /* ---------- עיצוב השורה העליונה ---------- */
    const BARS = [['dark', 'כהה קלאסי'], ['light', 'בהיר ונקי'], ['gold', 'זהב מבריק'], ['color', 'צבע הערכה'], ['glass', 'חלק ומינימלי'], ['ornate', 'מעוטר זהב']];
    function applyBar() {
        const sh = cur(), k = (sh && sh.topBar) || 'dark';
        Array.from(document.body.classList).filter(c => c.indexOf('bar-') === 0).forEach(c => document.body.classList.remove(c));
        document.body.classList.add('bar-' + k);
        document.querySelectorAll('#barOpts .bar-opt').forEach(b => b.classList.toggle('active', b.dataset.bar === k));
    }
    G.setTopBar = function (k) { const sh = cur(); if (!sh) return; sh.topBar = k; save(); applyBar(); };
    (function buildBarOpts() {
        const box = el('barOpts'); if (!box) return;
        box.innerHTML = BARS.map(([k, n]) => `<button type="button" class="bar-opt" data-bar="${k}" onclick="setTopBar('${k}')"><div class="bar-prev bp-${k}"><span>כ"ד חשוון תשפ"ז</span><i>15:08</i></div><b>${n}</b></button>`).join('');
    })();
    const _at = G.applyTheme;
    G.applyTheme = function (t) { _at(t); applyBar(); };

    /* ---------- אתחול ---------- */
    G.renderMonthlyCalendar = renderAdminCalendar;
    if (currentSynagogueKey) { v4Refresh(); applyBar(); }
})();
