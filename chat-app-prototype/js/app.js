(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var KEY = 'chatApp.v1';
  var PRESETS = ['#07C160', '#576B95', '#FA9D3B', '#E64340', '#7B68EE', '#00A3B4', '#F76F76', '#4A90E2'];
  var PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>';
  var PHONE_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 3.8h3.3l1.5 4.2-2 1.6a12.4 12.4 0 0 0 6.4 6.4l1.6-2 4.2 1.5v3.3c0 1-.8 1.8-1.8 1.8C10.6 20.2 3.8 13.4 3.8 5.6c0-1 .8-1.8 1.4-1.8z"/></svg>';
  var NAMES = { chat: '聊天', contacts: '通讯录', discover: '发现', me: '我' };
  var BOUNDS = ['阿', '八', '擦', '搭', '蛾', '发', '噶', '哈', '击', '喀', '垃', '妈', '拿', '哦', '啪', '期', '然', '撒', '塌', '挖', '夕', '压', '匝'];
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z'];
  var COLL = (function () { try { return new Intl.Collator('zh-Hans-CN-u-co-pinyin'); } catch (e) { return null; } })();
  // Pointer Events 兼容：老 WebView 降级为 touch/mouse
  var PDOWN = window.PointerEvent ? 'pointerdown' : 'touchstart';
  var PUP = window.PointerEvent ? 'pointerup' : 'touchend';
  var PCANCEL = window.PointerEvent ? 'pointercancel' : 'touchcancel';
  var EMOJIS = ['😀', '😄', '😁', '😆', '😊', '😍', '🥰', '😘', '😜', '😝', '🤪', '😎', '🤓', '😏', '😴', '😪',
    '😭', '😢', '🥺', '😤', '😡', '🤬', '😱', '😨', '😰', '🤔', '🤨', '😐', '😑', '🙄', '😬', '🤗',
    '🤭', '🤫', '😶', '😮', '😲', '🥳', '🤩', '🤤', '😋', '😵', '🤯', '🥶', '😇', '🤠', '💩', '👻',
    '👍', '👌', '✌️', '🙏', '👏', '💪', '🤝', '❤️', '💔', '💯', '🔥', '🎉', '🌹', '🍉', '🍺', '🐶'];
  var STATUS_POOL = ['在线', '忙碌中', '摸鱼中', '在听歌', '发呆', '出门散步', '学习中', '追剧中', '健身中', '准备休息'];
  var DEFAULT_EMOJI_GROUP = 'eg_default';

  var DB = loadDB();
  var activeTab = 'chat';
  var activeGroupId = null;
  var selected = {};
  var editingFriend = null;
  var editingCard = null;
  var activeFriendId = null;
  var pendingCallGroupId = null;
  var toastTimer = null;
  var libSearch = '';
  var libFilterGroup = null;
  var libBatchMode = false;
  var libSelected = {};
  var replyTimer = null;
  var typingOn = false;
  var statusTimer = null;
  var profileIsMe = false;
  var editingMe = false;
  var emojiGroupId = 'eg_default';
  var editingEmojiGroup = null;
  var editingEmojiImages = [];
  var emojiTab = 'emoji';

  var GROUP_COLORS = ['#FF6B6B', '#FF8E53', '#FFC542', '#51CF66', '#20C997', '#4DABF7', '#748FFC', '#DA77F2', '#F783AC', '#A9E34B', '#38D9A9', '#868E96'];

  /* ================= 数据 ================= */
  function normalizeMe(me) {
    me = me && typeof me === 'object' ? me : {};
    return {
      name: typeof me.name === 'string' && me.name.trim() ? me.name : '我',
      avatar: typeof me.avatar === 'string' ? me.avatar : '',
      color: me.color || '#07C160',
      region: typeof me.region === 'string' ? me.region : ''
    };
  }

  function normalizeEmojiItem(x) {
    if (typeof x === 'string' && x.trim()) return x.trim();
    if (x && typeof x === 'object' && typeof x.src === 'string' && x.src) {
      return { src: x.src, name: typeof x.name === 'string' ? x.name.slice(0, 16) : '表情' };
    }
    return null;
  }

  function normalizeEmojiGroups(list) {
    var out = (Array.isArray(list) ? list : []).map(function (g) {
      var items = (Array.isArray(g.items) ? g.items : []).map(normalizeEmojiItem).filter(Boolean);
      return {
        id: g.id || uid('eg_'),
        name: g.name || '表情库',
        items: items,
        builtin: !!g.builtin
      };
    });
    if (!out.some(function (g) { return g.builtin; })) {
      out.unshift({ id: DEFAULT_EMOJI_GROUP, name: '默认表情', items: EMOJIS.slice(), builtin: true });
    }
    return out;
  }

  function loadDB() {
    try {
      var raw = localStorage.getItem(KEY);
      var d = raw ? JSON.parse(raw) : {};
      var db = {
        me: normalizeMe(d.me),
        friends: Array.isArray(d.friends) ? d.friends : [],
        groups: (Array.isArray(d.groups) ? d.groups : []).map(function (g) {
          g.memberIds = Array.isArray(g.memberIds) ? g.memberIds : [];
          g.messages = (Array.isArray(g.messages) ? g.messages : []).map(function (m) {
            if (!m.type) m.type = 'text';
            if (typeof m.mine !== 'boolean') m.mine = true;
            return m;
          });
          g.pinned = !!g.pinned;
          g.muted = !!g.muted;
          g.bg = g.bg || 'gray';
          return g;
        }),
        cards: (Array.isArray(d.cards) ? d.cards : []).map(function (c) {
          if (typeof c.groupId !== 'string') c.groupId = null;
          if (typeof c.disabled !== 'boolean') c.disabled = false;
          return c;
        }),
        cardGroups: Array.isArray(d.cardGroups) ? d.cardGroups : [],
        emojiGroups: normalizeEmojiGroups(d.emojiGroups),
        settings: d.settings && typeof d.settings === 'object' ? d.settings : {}
      };
      var s = db.settings;
      if (typeof s.replyDelayMin !== 'number') s.replyDelayMin = 3000;
      if (typeof s.replyDelayMax !== 'number') s.replyDelayMax = 7000;
      if (typeof s.typingIndicatorEnabled !== 'boolean') s.typingIndicatorEnabled = true;
      if (!Array.isArray(s.statusPool) || !s.statusPool.length) s.statusPool = STATUS_POOL.slice();

      db.friends.forEach(function (f) {
        if (typeof f.region !== 'string') f.region = '';
        if (typeof f.autoReply !== 'boolean') f.autoReply = true;
        if (typeof f.status !== 'string' || !f.status) f.status = randomFrom(s.statusPool);
        if (typeof f.statusAt !== 'number') f.statusAt = Date.now();
        if (typeof f.statusNext !== 'number') f.statusNext = 1 + Math.random() * 7;
      });
      return db;
    } catch (e) {
      return {
        me: normalizeMe(null),
        friends: [],
        groups: [],
        cards: [],
        cardGroups: [],
        emojiGroups: normalizeEmojiGroups(null),
        settings: { replyDelayMin: 3000, replyDelayMax: 7000, typingIndicatorEnabled: true, statusPool: ['在线', '忙碌中', '摸鱼中', '在听歌', '发呆', '出门散步', '学习中', '追剧中', '健身中', '准备休息'] }
      };
    }
  }

  function saveDB() {
    try {
      localStorage.setItem(KEY, JSON.stringify(DB));
      return true;
    } catch (e) {
      toast('本地存储空间不足，头像可换小一点');
      return false;
    }
  }

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function friendById(id) { return DB.friends.filter(function (f) { return f.id === id; })[0] || null; }
  function groupById(id) { return DB.groups.filter(function (g) { return g.id === id; })[0] || null; }
  function cardById(id) { return DB.cards.filter(function (c) { return c.id === id; })[0] || null; }
  function cardGroupById(id) { return DB.cardGroups.filter(function (g) { return g.id === id; })[0] || null; }
  function cardsByGroup(gid) { return DB.cards.filter(function (c) { return c.groupId === gid; }); }
  function randomColor() { return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]; }
  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randomStatus() { return randomFrom(DB.settings.statusPool); }
  function emojiGroupById(id) { return DB.emojiGroups.filter(function (g) { return g.id === id; })[0] || null; }
  function activeEmojiGroup() { return emojiGroupById(emojiGroupId) || DB.emojiGroups[0] || null; }

  /* ================= 工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function initial(name) { var n = (name || '').trim(); return n ? n.charAt(0) : '友'; }
  function fmtListTime(ts) {
    var d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    var y = new Date(n.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function msgTimeHTML(ts) {
    var d = new Date(ts), n = new Date();
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var y = new Date(n.getTime() - 86400000);
    var main = d.toDateString() === y.toDateString() ? '昨天 ' + hm : hm;
    var date = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return '<div class="msg-time">' + main + '<em>' + date + '</em></div>';
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
  }
  function collate(a, b) {
    if (COLL) return COLL.compare(a, b);
    try { return String(a).localeCompare(String(b), 'zh-Hans-CN'); }
    catch (e) { return 0; }
  }
  function letterOf(name) {
    var c = (name || '').trim().charAt(0);
    if (!c) return '#';
    if (/[A-Za-z]/.test(c)) return c.toUpperCase();
    if (!/[\u4e00-\u9fa5]/.test(c)) return '#';
    var lo = 0, hi = BOUNDS.length - 1, res = '#';
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (collate(BOUNDS[mid], c) <= 0) {
        res = LETTERS[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return res;
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  function avatarHTML(f, uid) {
    var attr = uid ? ' data-uid="' + uid + '"' : '';
    if (f && f.avatar) return '<div class="av"' + attr + '><img src="' + f.avatar + '" alt=""></div>';
    return '<div class="av"' + attr + ' style="background:' + ((f && f.color) || '#07C160') + '">' + esc(initial(f && f.name)) + '</div>';
  }

  function groupAvatarHTML(g) {
    var members = g.memberIds.map(friendById).filter(Boolean).slice(0, 4);
    if (!members.length) return '<div class="gav gav-1"><span style="background:#C9C9C9">群</span></div>';
    return '<div class="gav gav-' + members.length + '">' + members.map(function (m) {
      if (m.avatar) return '<img src="' + m.avatar + '" alt="">';
      return '<span style="background:' + (m.color || '#07C160') + '">' + esc(initial(m.name)) + '</span>';
    }).join('') + '</div>';
  }

  function groupName(members) {
    var names = members.map(function (m) { return m.name; });
    if (names.length === 1) return names[0];
    if (names.length <= 3) return names.join('、');
    return names.slice(0, 2).join('、') + '等' + names.length + '人';
  }

  function shrinkImage(file, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var size = 160;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext('2d');
      var side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      cb(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast('已复制到剪贴板');
      } catch (e) {
        toast('复制失败');
      }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板'); }, fallback);
    } else {
      fallback();
    }
  }

  /* ================= 时间 ================= */
  function renderClock() {
    var d = new Date();
    var t = pad(d.getHours()) + ':' + pad(d.getMinutes());
    $('#sbClock').textContent = t;
    if (activeTab === 'chat') {
      var title = $('#title');
      if (!title.classList.contains('live')) title.classList.add('live');
      title.textContent = t;
    }
  }
  function clockLoop() {
    renderClock();
    setTimeout(clockLoop, 1000 - (Date.now() % 1000));
  }

  /* ================= 菜单 / 页面切换 ================= */
  function openMenu() {
    $('#plusMenu').classList.add('open');
    $('#mask').classList.add('open');
    $('#btnPlus').classList.add('active');
  }
  function closeMenu() {
    $('#plusMenu').classList.remove('open');
    $('#mask').classList.remove('open');
    $('#btnPlus').classList.remove('active');
  }

  function switchTab(key) {
    activeTab = key;
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === key); });
    closeMenu();
    $('#page-chat').classList.toggle('active', key === 'chat');
    $('#page-contacts').classList.toggle('active', key === 'contacts');
    $('#page-other').classList.toggle('active', key !== 'chat' && key !== 'contacts');
    var title = $('#title');
    if (key === 'chat') {
      renderClock();
    } else {
      title.classList.remove('live');
      title.textContent = NAMES[key];
    }
    if (key === 'contacts') renderContacts();
    if (key !== 'chat' && key !== 'contacts') $('#otherTip').textContent = NAMES[key] + ' 页面待实现';
  }

  function openScreen(id) {
    closeSheets();
    var el = document.getElementById(id);
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }
  function closeScreen(id) {
    var el = document.getElementById(id);
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }

  function openSheet(id) {
    closeSheets();
    closeMenu();
    var el = document.getElementById(id);
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    $('#sheetMask').classList.add('open');
  }
  function closeSheets() {
    $$('.sheet.open').forEach(function (s) {
      s.classList.remove('open');
      s.setAttribute('aria-hidden', 'true');
    });
    $('#sheetMask').classList.remove('open');
  }

  /* ================= 好友 ================= */
  function openFriendsSheet() {
    renderFriendsSheet();
    openSheet('sheetFriends');
  }

  function renderFriendsSheet() {
    var box = $('#friendList');
    if (!DB.friends.length) {
      box.innerHTML = '<div class="sheet-empty">还没有好友<br>点右上角「添加」创建</div>';
      return;
    }
    box.innerHTML = DB.friends.map(function (f) {
      return '<div class="friend-row" data-fid="' + f.id + '">' + avatarHTML(f) +
        '<div class="friend-name">' + esc(f.name) + '</div>' +
        '<button class="row-edit" aria-label="编辑">' + PENCIL + '</button></div>';
    }).join('');
  }

  function openFriendEdit(f) {
    editingMe = false;
    editingFriend = f
      ? { id: f.id, name: f.name, avatar: f.avatar || null, color: f.color || PRESETS[0], region: f.region || '' }
      : { id: null, name: '', avatar: null, color: PRESETS[0], region: '' };
    $('#friendEditTitle').textContent = f ? '编辑好友' : '添加好友';
    $('#friendName').value = editingFriend.name;
    $('#friendRegion').value = editingFriend.region;
    $('#friendDelete').classList.toggle('hidden', !f);
    renderAvatarEditor();
    openSheet('sheetFriendEdit');
    if (!f) setTimeout(function () { $('#friendName').focus(); }, 280);
  }

  function openMyEdit() {
    editingMe = true;
    editingFriend = {
      id: null,
      name: DB.me.name,
      avatar: DB.me.avatar || null,
      color: DB.me.color || PRESETS[0],
      region: DB.me.region || ''
    };
    $('#friendEditTitle').textContent = '编辑我的资料';
    $('#friendName').value = editingFriend.name;
    $('#friendRegion').value = editingFriend.region;
    $('#friendDelete').classList.add('hidden');
    renderAvatarEditor();
    openSheet('sheetFriendEdit');
  }

  function renderAvatarEditor() {
    var box = $('#avatarPreview');
    if (editingFriend.avatar) {
      box.style.background = 'transparent';
      box.innerHTML = '<img src="' + editingFriend.avatar + '" alt="">';
    } else {
      box.style.background = editingFriend.color;
      box.textContent = initial(editingFriend.name);
    }
    $('#swatches').innerHTML = PRESETS.map(function (c) {
      var active = (!editingFriend.avatar && c === editingFriend.color) ? ' active' : '';
      return '<button class="swatch' + active + '" style="background:' + c + '" data-color="' + c + '" aria-label="颜色"></button>';
    }).join('');
  }

  function saveFriend() {
    var name = $('#friendName').value.trim();
    if (!name) {
      toast(editingMe ? '请输入昵称' : '请输入好友昵称');
      $('#friendName').focus();
      return;
    }
    var region = $('#friendRegion').value.trim();
    if (editingMe) {
      DB.me.name = name;
      DB.me.avatar = editingFriend.avatar;
      DB.me.color = editingFriend.color;
      DB.me.region = region;
      saveDB();
      closeSheets();
      renderProfile();
      renderMessages();
      toast('已保存');
      return;
    }
    if (editingFriend.id) {
      var f = friendById(editingFriend.id);
      if (f) {
        f.name = name;
        f.avatar = editingFriend.avatar;
        f.color = editingFriend.color;
        f.region = region;
        DB.groups.forEach(function (g) {
          if (g.memberIds.length === 1 && g.memberIds[0] === f.id) g.name = name;
        });
      }
    } else {
      DB.friends.push({
        id: uid('f_'),
        name: name,
        avatar: editingFriend.avatar,
        color: editingFriend.color,
        region: region,
        createdAt: Date.now()
      });
    }
    saveDB();
    closeSheets();
    renderChatList();
    renderContacts();
    renderProfile();
    toast('已保存');
  }

  function deleteFriend() {
    if (editingMe || !editingFriend || !editingFriend.id) return;
    if (!confirm('删除好友「' + editingFriend.name + '」？')) return;
    var fid = editingFriend.id;
    DB.friends = DB.friends.filter(function (f) { return f.id !== fid; });
    DB.groups = DB.groups.filter(function (g) {
      g.memberIds = g.memberIds.filter(function (id) { return id !== fid; });
      return g.memberIds.length > 0;
    });
    saveDB();
    closeSheets();
    closeScreen('pageProfile');
    renderChatList();
    renderContacts();
    toast('已删除');
  }

  /* ================= 发起群聊 ================= */
  function openGroupSheet() {
    selected = {};
    renderGroupSheet();
    openSheet('sheetGroup');
  }

  function renderGroupSheet() {
    var box = $('#groupList');
    if (!DB.friends.length) {
      box.innerHTML = '<div class="sheet-empty">还没有好友，先添加好友<br><button class="empty-btn" id="emptyAddFriend">去添加好友</button></div>';
    } else {
      box.innerHTML = DB.friends.map(function (f) {
        var on = selected[f.id] ? ' selected' : '';
        return '<div class="pick' + on + '" data-fid="' + f.id + '">' + avatarHTML(f) +
          '<div class="pick-name">' + esc(f.name) + '</div><span class="check"></span></div>';
      }).join('');
    }
    $('#groupDone').disabled = !Object.keys(selected).length;
  }

  function createGroupFromSelection() {
    var members = Object.keys(selected).map(friendById).filter(Boolean);
    if (!members.length) return;
    var group;
    if (members.length === 1) {
      group = groupById(findOrCreateSingle(members[0].id));
    } else {
      group = {
        id: uid('g_'),
        name: groupName(members),
        memberIds: members.map(function (m) { return m.id; }),
        createdAt: Date.now(),
        messages: [],
        pinned: false,
        muted: false,
        bg: 'gray'
      };
      DB.groups.unshift(group);
      saveDB();
    }
    closeSheets();
    renderChatList();
    if (group) openChat(group.id);
  }

  /* ================= 通讯录 ================= */
  function renderContacts() {
    var box = $('#contactsList');
    var byLetter = {};
    DB.friends.forEach(function (f) {
      var l = letterOf(f.name);
      (byLetter[l] = byLetter[l] || []).push(f);
    });
    var letters = Object.keys(byLetter).sort(function (a, b) {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a < b ? -1 : 1;
    });
    letters.forEach(function (l) {
      byLetter[l].sort(function (a, b) { return collate(a.name, b.name); });
    });
    var html = '<div class="contacts-tool">' +
      '<div class="tool-row" id="newFriendRow">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FE9C1E" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="8.6" r="3.6"/><path d="M3.6 19.4c.5-3.3 3-5.4 6.4-5.4 1 0 1.8.2 2.6.6"/><path d="M18 12.6v6M15 15.6h6"/></svg>' +
      '<span>新的朋友</span></div></div>';
    letters.forEach(function (l) {
      html += '<div class="group-letter" id="grp-' + l + '">' + l + '</div>';
      byLetter[l].forEach(function (f) {
        html += '<div class="contact-row" data-fid="' + f.id + '">' + avatarHTML(f) +
          '<div class="contact-name">' + esc(f.name) + '</div></div>';
      });
    });
    if (!DB.friends.length) html += '<div class="library-empty">还没有好友<br>点右上角「+」添加朋友</div>';
    box.innerHTML = html;

    var rail = $('#indexRail');
    if (!letters.length) {
      rail.innerHTML = '';
      rail.classList.add('hidden');
    } else {
      rail.classList.remove('hidden');
      rail.innerHTML = letters.map(function (l) {
        return '<span data-letter="' + l + '">' + l + '</span>';
      }).join('');
    }
  }

  /* ================= 好友资料 ================= */
  function openProfile(fid) {
    var f = friendById(fid);
    if (!f) return;
    profileIsMe = false;
    activeFriendId = fid;
    renderProfile();
    openScreen('pageProfile');
  }

  function openMyProfile() {
    profileIsMe = true;
    activeFriendId = null;
    renderProfile();
    openScreen('pageProfile');
  }

  function renderProfile() {
    var f = profileIsMe ? DB.me : friendById(activeFriendId);
    if (!f) return;
    $('#profileName').textContent = f.name;
    $('#profileRegion').textContent = f.region || '未设置';
    var av = $('#profileAvatar');
    if (f.avatar) {
      av.style.background = 'transparent';
      av.innerHTML = '<img src="' + f.avatar + '" alt="">';
    } else {
      av.style.background = f.color || '#07C160';
      av.innerHTML = esc(initial(f.name));
    }
    $('#profileChat').classList.toggle('hidden', profileIsMe);
    $('#profileCall').classList.toggle('hidden', profileIsMe);
  }

  function openRegionSheet() {
    var f = profileIsMe ? DB.me : friendById(activeFriendId);
    if (!f) return;
    $('#regionInput').value = f.region || '';
    openSheet('sheetRegion');
    setTimeout(function () { $('#regionInput').focus(); }, 260);
  }

  function saveRegion() {
    var f = profileIsMe ? DB.me : friendById(activeFriendId);
    if (!f) return;
    f.region = $('#regionInput').value.trim();
    saveDB();
    renderProfile();
    closeSheets();
    toast('地区已更新');
  }

  function findOrCreateSingle(fid) {
    var f = friendById(fid);
    var g = DB.groups.filter(function (x) {
      return x.memberIds.length === 1 && x.memberIds[0] === fid;
    })[0];
    if (!g) {
      g = {
        id: uid('g_'),
        name: f ? f.name : '聊天',
        memberIds: [fid],
        createdAt: Date.now(),
        messages: [],
        pinned: false,
        muted: false,
        bg: 'gray'
      };
      DB.groups.unshift(g);
      saveDB();
    }
    return g.id;
  }

  /* ================= 会话列表 ================= */
  function sortedGroups() {
    return DB.groups.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      var la = a.messages.length ? a.messages[a.messages.length - 1].ts : a.createdAt;
      var lb = b.messages.length ? b.messages[b.messages.length - 1].ts : b.createdAt;
      return lb - la;
    });
  }

  function previewOf(m) {
    if (!m) return '';
    if (m.type === 'voice') return '[语音] ' + (m.dur || 1) + '"';
    if (m.type === 'sticker') return '[动画表情]';
    if (m.type === 'card') return '[字卡] ' + (m.title || m.text || '');
    if (m.type === 'call') return m.text;
    return m.text;
  }

  function renderChatList() {
    var list = $('#chatList');
    var groups = sortedGroups();
    if (!groups.length) {
      list.innerHTML = '<div class="library-empty">还没有聊天<br>点右上角「+」「发起群聊」开始</div>';
      return;
    }
    list.innerHTML = groups.map(function (g) {
      var last = g.messages[g.messages.length - 1];
      var sub = last ? previewOf(last) : g.memberIds.length + ' 人';
      return '<div class="cell" data-gid="' + g.id + '">' + groupAvatarHTML(g) +
        '<div class="cell-main"><div class="cell-title">' + (g.muted ? '<span class="muted-ico">🔕</span> ' : '') + esc(g.name) + '</div>' +
        '<div class="cell-sub">' + esc(sub) + '</div></div>' +
        '<div class="cell-time">' + (last ? fmtListTime(last.ts) : '') + '</div></div>';
    }).join('');
  }

  /* ================= 聊天详情 ================= */
  function openChat(id) {
    var g = groupById(id);
    if (!g) return;
    if (replyTimer) { clearTimeout(replyTimer); replyTimer = null; }
    hideTyping();
    activeGroupId = id;
    typingOn = false;
    updateChatHeader();
    $('#msgInput').value = '';
    setVoiceMode(false);
    closePanels();
    updateSendState();
    applyBg(g.bg);
    renderMessages();
    openScreen('pageChatDetail');
    setTimeout(scrollMessages, 80);
  }

  function applyBg(bg) {
    var area = $('#msgArea');
    area.classList.remove('bg-gray', 'bg-white', 'bg-warm');
    area.classList.add('bg-' + (bg || 'gray'));
  }

  function renderMessages() {
    var g = groupById(activeGroupId);
    if (!g) return;
    var area = $('#msgArea');
    if (!g.messages.length) {
      area.innerHTML = '<div class="chat-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M20.5 4.5H3.5c-.6 0-1 .4-1 1v9c0 .6.4 1 1 1h6.7l3.6 3.4v-3.4h6.7c.6 0 1-.4 1-1v-9c0-.6-.4-1-1-1z"/></svg><div>打个招呼吧</div></div>';
      return;
    }
    var html = '', prev = 0;
    g.messages.forEach(function (m) {
      if (m.ts - prev > 5 * 60 * 1000) html += msgTimeHTML(m.ts);
      prev = m.ts;
      html += bubbleHTML(m);
    });
    area.innerHTML = html;
  }

  function bubbleHTML(m) {
    var inner;
    if (m.type === 'voice') {
      inner = '<div class="bubble voice" data-play="1"><span class="voice-bars"><i></i><i></i><i></i></span><span class="voice-len">' + (m.dur || 1) + '"</span></div>';
    } else if (m.type === 'sticker') {
      if (m.sticker) {
        inner = '<div class="bubble sticker pic"><img src="' + m.sticker + '" alt=""></div>';
      } else {
        var long = Array.from(String(m.text || '')).length > 2;
        inner = '<div class="bubble sticker' + (long ? ' sm' : '') + '">' + esc(m.text) + '</div>';
      }
    } else if (m.type === 'card') {
      inner = '<div class="bubble card"><div class="cd-title">' + esc(m.title || '字卡') + '</div><div class="cd-text">' + esc(m.text) + '</div></div>';
    } else if (m.type === 'call') {
      inner = '<div class="call-note">' + PHONE_ICO + '<span>' + esc(m.text) + '</span></div>';
    } else {
      inner = '<div class="bubble">' + esc(m.text) + '</div>';
    }
    var mine = m.mine !== false;
    var cls = mine ? 'mine' : 'their';
    var av;
    if (mine) {
      av = avatarHTML(DB.me, '__me__');
    } else {
      var f = (m.senderId ? friendById(m.senderId) : null) || singleFriend() || { name: '友', color: '#9AA7B4' };
      av = avatarHTML(f, f.id || '');
    }
    var body = '<div class="msg-body">' + inner + '</div>';
    return '<div class="msg ' + cls + '" data-mid="' + m.id + '">' + (mine ? body + av : av + body) + '</div>';
  }

  function updateChatHeader() {
    var g = groupById(activeGroupId);
    if (!g) return;
    $('#chatTitle').textContent = typingOn ? '对方正在输入…' : g.name;
    $('#chatCount').textContent = g.memberIds.length > 1 ? '(' + g.memberIds.length + ')' : '';
    var st = $('#chatStatus');
    var f = g.memberIds.length === 1 ? friendById(g.memberIds[0]) : null;
    if (f && f.status) {
      st.textContent = f.status;
      st.classList.remove('hidden');
    } else {
      st.classList.add('hidden');
    }
  }

  function singleFriend() {
    var g = groupById(activeGroupId);
    if (!g || g.memberIds.length !== 1) return null;
    return friendById(g.memberIds[0]);
  }

  function scrollMessages() {
    var area = $('#msgArea');
    area.scrollTop = area.scrollHeight;
  }

  function updateSendState() {
    var has = !!$('#msgInput').value.trim();
    $('#sendBtn').classList.toggle('hidden', !has);
    $('#compMic').classList.toggle('hidden', has);
    $('#sendBtn').disabled = !has;
  }

  function sendMsg(m) {
    var g = groupById(activeGroupId);
    if (!g) return;
    m.id = m.id || uid('m_');
    m.ts = m.ts || Date.now();
    if (typeof m.mine !== 'boolean') m.mine = true;
    g.messages.push(m);
    saveDB();
    renderMessages();
    renderChatList();
    scrollMessages();
    if (m.mine) triggerAutoReply();
  }

  function sendText() {
    var text = $('#msgInput').value.trim();
    if (!text) return;
    $('#msgInput').value = '';
    updateSendState();
    sendMsg({ type: 'text', text: text });
  }

  /* ================= 自动回复 ================= */
  function getReplyPool() {
    var disabledGroups = {};
    DB.cardGroups.forEach(function (g) { if (g.disabled) disabledGroups[g.id] = true; });
    return DB.cards.filter(function (c) {
      if (c.disabled) return false;
      if (c.groupId && disabledGroups[c.groupId]) return false;
      return true;
    });
  }

  function showTyping(friend) {
    if (!DB.settings.typingIndicatorEnabled) return;
    if (!friend) friend = singleFriend();
    if (!friend) return;
    typingOn = true;
    updateChatHeader();
  }

  function hideTyping() {
    typingOn = false;
    updateChatHeader();
  }

  function triggerAutoReply() {
    var g = groupById(activeGroupId);
    if (!g || g.memberIds.length !== 1) return;
    var f = friendById(g.memberIds[0]);
    if (!f || !f.autoReply) return;
    var pool = getReplyPool();
    if (!pool.length) return;

    if (replyTimer) { clearTimeout(replyTimer); replyTimer = null; }
    hideTyping();

    if (DB.settings.typingIndicatorEnabled) showTyping(f);

    var range = Math.max(0, DB.settings.replyDelayMax - DB.settings.replyDelayMin);
    var delay = DB.settings.replyDelayMin + Math.random() * range;
    replyTimer = setTimeout(function () {
      replyTimer = null;
      hideTyping();
      var card = pool[Math.floor(Math.random() * pool.length)];
      var g2 = groupById(activeGroupId);
      if (!g2) return;
      g2.messages.push({
        id: uid('m_'),
        type: 'text',
        text: card.content,
        ts: Date.now(),
        mine: false,
        senderId: f.id
      });
      saveDB();
      renderMessages();
      renderChatList();
      scrollMessages();
    }, delay);
  }

  function tickStatuses() {
    var now = Date.now();
    var changed = false, activeChanged = false;
    var g = groupById(activeGroupId);
    var activeFid = g && g.memberIds.length === 1 ? g.memberIds[0] : null;
    DB.friends.forEach(function (f) {
      if (now - f.statusAt >= f.statusNext * 3600000) {
        f.status = randomStatus();
        f.statusAt = now;
        f.statusNext = 1 + Math.random() * 7;
        changed = true;
        if (f.id === activeFid) activeChanged = true;
      }
    });
    if (changed) {
      saveDB();
      if (activeChanged) updateChatHeader();
      if (profileIsMe === false && activeFriendId) renderProfile();
    }
    statusTimer = setTimeout(tickStatuses, 60000);
  }

  /* ================= 语音 ================= */
  var recStart = 0, recTimer = null;

  function setVoiceMode(on) {
    voiceMode = !!on;
    $('#msgInput').classList.toggle('hidden', voiceMode);
    $('#compMic').classList.add('hidden');
    $('#holdTalk').classList.toggle('hidden', !voiceMode);
    $('#icoVoice').classList.toggle('hidden', voiceMode);
    $('#icoKeyboard').classList.toggle('hidden', !voiceMode);
    if (voiceMode) {
      $('#sendBtn').classList.add('hidden');
      closePanels();
    } else {
      updateSendState();
    }
  }

  function startRec(e) {
    if (recStart) return;
    if (e && e.cancelable) e.preventDefault();
    recStart = Date.now();
    $('#holdTalk').classList.add('active');
    $('#recOverlay').classList.remove('hidden');
    $('#recTime').textContent = '0:00';
    clearInterval(recTimer);
    recTimer = setInterval(function () {
      var s = Math.floor((Date.now() - recStart) / 1000);
      $('#recTime').textContent = '0:' + pad(s);
    }, 200);
  }

  function stopRec(cancel) {
    if (!recStart) return;
    var ms = Date.now() - recStart;
    recStart = 0;
    clearInterval(recTimer);
    $('#holdTalk').classList.remove('active');
    $('#recOverlay').classList.add('hidden');
    if (cancel) return;
    if (ms < 600) {
      toast('说话时间太短');
      return;
    }
    sendMsg({ type: 'voice', text: '[语音]', dur: Math.max(1, Math.round(ms / 1000)) });
  }

  /* ================= 表情 / 字卡面板 ================= */
  var voiceMode = false;
  var plusPage = 0;
  var libraryFromChat = false;
  var callState = null;

  function closePanels() {
    $('#emojiPanel').classList.add('hidden');
    $('#plusPanel').classList.add('hidden');
    $('#emojiToggle').classList.remove('active');
    $('#plusToggle').classList.remove('active');
  }

  function openEmojiPanel() {
    if (voiceMode) setVoiceMode(false);
    $('#msgInput').blur();
    $('#plusPanel').classList.add('hidden');
    $('#plusToggle').classList.remove('active');
    $('#emojiPanel').classList.remove('hidden');
    $('#emojiToggle').classList.add('active');
    switchEmojiTab('emoji');
  }

  function switchEmojiTab(tab) {
    emojiTab = tab;
    $$('.panel-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.etab === tab); });
    $('#emojiLibBar').classList.toggle('hidden', tab !== 'emoji');
    $('#emojiGrid').classList.toggle('hidden', tab !== 'emoji');
    $('#cardPick').classList.toggle('hidden', tab !== 'cards');
    $('#manageCards').classList.remove('hidden');
    if (tab === 'cards') renderCardPick();
    else { renderEmojiLibBar(); renderEmojiGrid(); }
  }

  function renderEmojiLibBar() {
    var bar = $('#emojiLibBar');
    var html = DB.emojiGroups.map(function (g) {
      return '<button class="chip' + (g.id === emojiGroupId ? ' active' : '') + '" data-egid="' + g.id + '">' + esc(g.name) + '</button>';
    }).join('');
    html += '<button class="chip add" data-egid="__mgr__">＋ 新建</button>';
    bar.innerHTML = html;
  }

  function renderEmojiGrid() {
    var grid = $('#emojiGrid');
    var g = activeEmojiGroup();
    if (!g) { grid.innerHTML = ''; return; }
    grid.classList.toggle('img-grid', g.items.some(function (it) { return it && typeof it === 'object'; }));
    if (!g.items.length) {
      grid.innerHTML = '<div class="emoji-empty">这个表情库还是空的<br>点上方「＋ 新建」或「管理」添加</div>';
      return;
    }
    grid.innerHTML = g.items.map(function (it, idx) {
      if (typeof it === 'string') return '<button data-emoji="' + esc(it) + '">' + esc(it) + '</button>';
      return '<button class="eg-img" data-emoji-img="' + idx + '"><img src="' + it.src + '" alt=""><span>' + esc(it.name) + '</span></button>';
    }).join('');
  }

  function openEmojiMgr() {
    renderEmojiMgr();
    openSheet('sheetEmojiMgr');
  }

  function renderEmojiMgr() {
    var box = $('#emojiMgrList');
    box.innerHTML = DB.emojiGroups.map(function (g) {
      var first = g.items[0];
      var ico = !first ? '🙂' : (typeof first === 'string' ? esc(first) : '<img src="' + first.src + '" alt="">');
      return '<div class="emoji-mgr-row" data-egid="' + g.id + '">' +
        '<div class="emoji-mgr-ico">' + ico + '</div>' +
        '<div class="emoji-mgr-name">' + esc(g.name) + '</div>' +
        (g.builtin ? '<span class="emoji-mgr-badge">默认</span>' : '') +
        '<span class="emoji-mgr-count">' + g.items.length + ' 个</span></div>';
    }).join('');
  }

  function openEmojiEdit(g) {
    editingEmojiGroup = g
      ? { id: g.id, name: g.name, builtin: !!g.builtin }
      : { id: null, name: '', builtin: false };
    editingEmojiImages = g ? g.items.filter(function (it) { return it && typeof it === 'object'; }).map(function (it) {
      return { src: it.src, name: it.name };
    }) : [];
    $('#emojiGroupTitle').textContent = g ? (g.builtin ? '默认表情' : '编辑表情库') : '新建表情库';
    $('#emojiGroupName').value = editingEmojiGroup.name;
    $('#emojiItems').value = g ? g.items.filter(function (it) { return typeof it === 'string'; }).join('\n') : '';
    renderEmojiImgList();
    $('#emojiGroupDelete').classList.toggle('hidden', !g || !!g.builtin);
    openSheet('sheetEmojiEdit');
    if (!g) setTimeout(function () { $('#emojiGroupName').focus(); }, 260);
  }

  function renderEmojiImgList() {
    var box = $('#emojiImgList');
    if (!editingEmojiImages.length) {
      box.innerHTML = '<div class="emoji-img-empty">还没有图片表情</div>';
      return;
    }
    box.innerHTML = editingEmojiImages.map(function (it, i) {
      return '<div class="emoji-img-row" data-idx="' + i + '">' +
        '<img src="' + it.src + '" alt="">' +
        '<input class="emoji-img-name" data-idx="' + i + '" maxlength="16" value="' + esc(it.name) + '" placeholder="表情名称">' +
        '<button class="emoji-img-del" data-idx="' + i + '" aria-label="删除">×</button></div>';
    }).join('');
  }

  function saveEmojiGroup() {
    var name = $('#emojiGroupName').value.trim();
    if (!name) { toast('请输入表情库名称'); $('#emojiGroupName').focus(); return; }
    var seen = {};
    var textItems = $('#emojiItems').value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) {
      if (!s || seen[s]) return false;
      seen[s] = true;
      return true;
    });
    var imgItems = editingEmojiImages.map(function (it) {
      return { src: it.src, name: (it.name || '').trim() || '表情' };
    });
    var items = textItems.concat(imgItems);
    if (editingEmojiGroup.id) {
      var g = emojiGroupById(editingEmojiGroup.id);
      if (g) { g.name = name; g.items = items; }
    } else {
      var ng = { id: uid('eg_'), name: name, items: items, builtin: false };
      DB.emojiGroups.push(ng);
      emojiGroupId = ng.id;
    }
    saveDB();
    renderEmojiLibBar();
    renderEmojiGrid();
    closeSheets();
    openEmojiMgr();
    toast('已保存');
  }

  function deleteEmojiGroup() {
    if (!editingEmojiGroup || !editingEmojiGroup.id) return;
    var target = emojiGroupById(editingEmojiGroup.id);
    if (!target || target.builtin) return;
    if (!confirm('删除表情库「' + target.name + '」？')) return;
    DB.emojiGroups = DB.emojiGroups.filter(function (x) { return x.id !== target.id; });
    if (emojiGroupId === target.id) emojiGroupId = DEFAULT_EMOJI_GROUP;
    saveDB();
    closeSheets();
    renderEmojiLibBar();
    renderEmojiGrid();
    openEmojiMgr();
    toast('已删除表情库');
  }

  function importEmojiFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var items;
      try {
        var data = JSON.parse(text);
        if (Array.isArray(data)) items = data.map(String);
        else if (data && Array.isArray(data.items)) items = data.items.map(String);
        else items = text.split(/\r?\n/);
      } catch (e) {
        items = text.split(/\r?\n/);
      }
      items = items.map(function (s) { return s.trim(); }).filter(Boolean);
      if (!items.length) { toast('文件里没有可导入的表情'); return; }
      var seen = {};
      var merged = $('#emojiItems').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).concat(items).filter(function (s) {
        if (seen[s]) return false;
        seen[s] = true;
        return true;
      });
      $('#emojiItems').value = merged.join('\n');
      toast('已导入 ' + items.length + ' 个表情，记得保存');
    };
    reader.onerror = function () { toast('文件读取失败'); };
    reader.readAsText(file);
  }

  function shrinkStickerImage(file, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var max = 140;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var w = Math.max(1, Math.round(img.width * scale));
      var h = Math.max(1, Math.round(img.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      var out;
      try { out = canvas.toDataURL('image/webp', 0.86); } catch (e) { out = canvas.toDataURL('image/png'); }
      cb(out);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  function importEmojiImages(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    var remain = list.length, added = 0;
    list.forEach(function (file) {
      shrinkStickerImage(file, function (src) {
        if (src) {
          var name = file.name.replace(/\.[^.]+$/, '').slice(0, 16) || '表情';
          editingEmojiImages.push({ src: src, name: name });
          added++;
        }
        if (--remain === 0) {
          renderEmojiImgList();
          toast(added ? '已导入 ' + added + ' 张图片，命名后记得保存' : '图片处理失败');
        }
      });
    });
  }

  var cardPickFilter = null;
  function renderCardPick() {
    var filterBox = $('#cardPickFilter');
    var list = $('#cardPickList');
    var disabledGroups = {};
    DB.cardGroups.forEach(function (g) { if (g.disabled) disabledGroups[g.id] = true; });
    var available = DB.cards.filter(function (c) { return !c.disabled && !(c.groupId && disabledGroups[c.groupId]); });

    var filterHtml = '<button class="chip' + (cardPickFilter === null ? ' active' : '') + '" data-gid="">全部</button>';
    DB.cardGroups.forEach(function (g) {
      if (g.disabled) return;
      filterHtml += '<button class="chip' + (cardPickFilter === g.id ? ' active' : '') + '" data-gid="' + g.id + '"><span class="dot" style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + g.color + ';margin-right:3px;vertical-align:middle"></span>' + esc(g.name) + '</button>';
    });
    filterBox.innerHTML = filterHtml;

    var cards = available.filter(function (c) {
      return cardPickFilter === null || c.groupId === cardPickFilter;
    });
    if (!cards.length) {
      list.innerHTML = '<div class="library-empty">字卡库还是空的<br>点右上角「管理」新建</div>';
      return;
    }
    list.innerHTML = cards.map(function (c) {
      return '<button class="card-pick-item" data-cid="' + c.id + '"><b>' + esc(c.title || '未命名字卡') +
        '</b><span>' + esc(c.content) + '</span></button>';
    }).join('');
  }

  function setPlusPage(p) {
    plusPage = p ? 1 : 0;
    $('#plusTrack').style.transform = 'translateX(-' + (plusPage * 50) + '%)';
    $$('#plusDots i').forEach(function (d, i) { d.classList.toggle('active', i === plusPage); });
  }

  function openPlusPanel() {
    if (voiceMode) setVoiceMode(false);
    $('#msgInput').blur();
    $('#emojiPanel').classList.add('hidden');
    $('#emojiToggle').classList.remove('active');
    $('#plusPanel').classList.remove('hidden');
    $('#plusToggle').classList.add('active');
    setPlusPage(plusPage);
  }

  function onPlusAction(key) {
    if (key === 'video') {
      openCallOptions(activeGroupId);
      return;
    }
    var tips = {
      album: '相册：暂未接入图片消息',
      camera: '拍摄：暂未接入相机',
      location: '位置：功能待开发',
      redpacket: '红包：功能待开发',
      gift: '礼物：功能待开发',
      transfer: '转账：功能待开发',
      voiceinput: '语音输入：功能待开发',
      favorite: '收藏：功能待开发',
      contact: '个人名片：功能待开发',
      file: '文件：功能待开发',
      music: '音乐：功能待开发'
    };
    toast(tips[key] || '功能待开发');
  }

  /* ================= 消息设置 ================= */
  function openChatSettings() {
    var g = groupById(activeGroupId);
    if (!g) return;
    $('#swPinned').classList.toggle('active', !!g.pinned);
    $('#swMuted').classList.toggle('active', !!g.muted);
    $$('#bgSwatches .bg-swatch').forEach(function (b) {
      b.classList.toggle('active', b.dataset.bg === (g.bg || 'gray'));
    });
    var isSingle = g.memberIds.length === 1;
    var autoRow = $('#autoReplyRow');
    if (isSingle) {
      var f = friendById(g.memberIds[0]);
      autoRow.classList.remove('hidden');
      $('#swAutoReply').classList.toggle('active', !!(f && f.autoReply));
    } else {
      autoRow.classList.add('hidden');
    }
    openSheet('sheetChatSettings');
  }

  function openAppSettings() {
    $('#swTyping').classList.toggle('active', !!DB.settings.typingIndicatorEnabled);
    $('#delayMin').value = DB.settings.replyDelayMin;
    $('#delayMax').value = DB.settings.replyDelayMax;
    openSheet('sheetAppSettings');
  }

  /* ================= 音视频通话 ================= */
  function openCallOptions(gid) {
    pendingCallGroupId = gid || activeGroupId;
    if (!pendingCallGroupId) {
      toast('请先选择聊天');
      return;
    }
    openSheet('sheetCallOptions');
  }

  function startCall(mode) {
    var g = groupById(pendingCallGroupId || activeGroupId);
    if (!g) return;
    closeSheets();
    var members = g.memberIds.map(friendById).filter(Boolean);
    var target = members.length === 1 ? members[0] : null;
    callState = { gid: g.id, mode: mode, connected: false, startTs: 0, timer: null, connectTimer: null };

    $('#callName').textContent = g.name;
    var av = $('#callAvatar');
    if (target && target.avatar) {
      av.style.background = 'transparent';
      av.innerHTML = '<img src="' + target.avatar + '" alt="">';
    } else if (target) {
      av.style.background = target.color || '#07C160';
      av.innerHTML = esc(initial(target.name));
    } else {
      av.style.background = '#3E4E48';
      av.innerHTML = esc(initial(g.name));
    }
    $('#callStatus').textContent = '正在呼叫…';
    $$('.call-btn').forEach(function (b) { b.classList.remove('active'); });
    var screen = $('#callScreen');
    screen.classList.toggle('video', mode === 'video');
    screen.classList.add('open');
    screen.setAttribute('aria-hidden', 'false');

    callState.connectTimer = setTimeout(connectCall, 2200);
  }

  function connectCall() {
    if (!callState) return;
    callState.connected = true;
    callState.startTs = Date.now();
    $('#callStatus').textContent = '00:00';
    callState.timer = setInterval(function () {
      if (!callState) return;
      $('#callStatus').textContent = fmtDur((Date.now() - callState.startTs) / 1000);
    }, 1000);
  }

  function hangupCall() {
    if (!callState) return;
    var st = callState;
    clearTimeout(st.connectTimer);
    clearInterval(st.timer);
    callState = null;

    var screen = $('#callScreen');
    screen.classList.remove('open', 'video');
    screen.setAttribute('aria-hidden', 'true');

    var g = groupById(st.gid);
    if (!g) return;
    var label = st.mode === 'video' ? '视频通话' : '语音通话';
    var text = st.connected
      ? label + ' 通话时长 ' + fmtDur((Date.now() - st.startTs) / 1000)
      : label + ' 已取消';
    g.messages.push({ id: uid('m_'), type: 'call', text: text, ts: Date.now() });
    saveDB();
    renderChatList();
    if (activeGroupId === g.id) {
      renderMessages();
      scrollMessages();
    }
  }

  /* ================= 字卡库 ================= */
  function openLibrary(fromChat) {
    libraryFromChat = !!fromChat;
    libSearch = '';
    libFilterGroup = null;
    libBatchMode = false;
    libSelected = {};
    $('#libSearchBar').classList.add('hidden');
    $('#libSearchInput').value = '';
    $('#libBatchBar').classList.add('hidden');
    renderLibrary();
    openScreen('pageLibrary');
  }

  function closeLibrary() {
    closeScreen('pageLibrary');
    if (libraryFromChat) {
      libraryFromChat = false;
      openEmojiPanel();
      switchEmojiTab('cards');
    }
  }

  function filteredCards() {
    var q = libSearch.trim().toLowerCase();
    return DB.cards.filter(function (c) {
      if (libFilterGroup !== null && c.groupId !== libFilterGroup) return false;
      if (!q) return true;
      return (c.title || '').toLowerCase().indexOf(q) >= 0 || (c.content || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderFilterBar() {
    var bar = $('#libFilterBar');
    var allCount = DB.cards.length;
    var html = '<button class="chip' + (libFilterGroup === null ? ' active' : '') + '" data-gid="">全部 ' + allCount + '</button>';
    DB.cardGroups.forEach(function (g) {
      var count = cardsByGroup(g.id).length;
      html += '<button class="chip' + (libFilterGroup === g.id ? ' active' : '') + (g.disabled ? ' disabled' : '') + '" data-gid="' + g.id + '" style="color:' + g.color + ';border-color:' + g.color + '40">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + g.color + ';margin-right:4px;vertical-align:middle"></span>' + esc(g.name) + ' ' + count + '</button>';
    });
    var noGroup = DB.cards.filter(function (c) { return !c.groupId; }).length;
    if (noGroup) html += '<button class="chip' + (libFilterGroup === '' ? ' active' : '') + '" data-gid="__none__">未分组 ' + noGroup + '</button>';
    bar.innerHTML = html;
  }

  function renderLibrary() {
    renderFilterBar();
    var box = $('#cardList');
    var cards = filteredCards();
    if (!DB.cards.length) {
      box.innerHTML = '<div class="library-empty">字卡库还是空的<br><button class="empty-btn" id="emptyNewCard">新建字卡</button></div>';
      return;
    }
    if (!cards.length) {
      box.innerHTML = '<div class="library-empty">没有匹配的字卡</div>';
      return;
    }
    box.innerHTML = cards.map(function (c) {
      var grp = c.groupId ? cardGroupById(c.groupId) : null;
      var badge = grp ? '<span class="card-badge" style="background:' + grp.color + '18;color:' + grp.color + ';border-color:' + grp.color + '40"><span style="width:5px;height:5px;border-radius:50%;background:' + grp.color + '"></span>' + esc(grp.name) + '</span>' : '';
      var sel = libSelected[c.id] ? ' selected' : '';
      var dis = c.disabled ? ' disabled' : '';
      var batchCls = libBatchMode ? ' batch' + sel : '';
      var check = libBatchMode ? '<span class="card-check"></span>' : '';
      return '<div class="card-row' + batchCls + dis + '" data-cid="' + c.id + '">' + check + '<div class="card-main">' +
        '<div class="card-title">' + esc(c.title || '未命名字卡') + '</div>' +
        '<div class="card-text">' + esc(c.content) + '</div>' + badge + '</div>' +
        (libBatchMode ? '' : '<button class="row-edit" aria-label="编辑">' + PENCIL + '</button>') + '</div>';
    }).join('');
  }

  function updateBatchBar() {
    var n = Object.keys(libSelected).length;
    $('#libBatchBar').classList.toggle('hidden', !libBatchMode);
    $('.lib-batch-count').textContent = '已选 ' + n + ' 项';
  }

  function toggleBatchMode() {
    libBatchMode = !libBatchMode;
    libSelected = {};
    updateBatchBar();
    renderLibrary();
  }

  function openCardEdit(c) {
    editingCard = c
      ? { id: c.id, title: c.title || '', content: c.content || '', groupId: c.groupId || null }
      : { id: null, title: '', content: '', groupId: libFilterGroup && libFilterGroup !== '__none__' && libFilterGroup !== '' ? libFilterGroup : null };
    $('#cardEditTitle').textContent = c ? '编辑字卡' : '新建字卡';
    $('#cardTitle').value = editingCard.title;
    $('#cardContent').value = editingCard.content;
    $('#cardDelete').classList.toggle('hidden', !c);
    renderCardGroupChips();
    openSheet('sheetCardEdit');
    setTimeout(function () { $('#cardContent').focus(); }, 280);
  }

  function renderCardGroupChips() {
    var box = $('#cardGroupChips');
    var html = '<button class="chip' + (!editingCard.groupId ? ' active' : '') + '" data-gid="">未分组</button>';
    DB.cardGroups.forEach(function (g) {
      var active = editingCard.groupId === g.id ? ' active' : '';
      html += '<button class="chip' + active + '" data-gid="' + g.id + '"><span class="dot" style="background:' + g.color + '"></span>' + esc(g.name) + '</button>';
    });
    box.innerHTML = html;
  }

  function saveCard() {
    var title = $('#cardTitle').value.trim();
    var content = $('#cardContent').value.trim();
    if (!content) {
      toast('写点内容再保存');
      $('#cardContent').focus();
      return;
    }
    if (editingCard.id) {
      var c = cardById(editingCard.id);
      if (c) { c.title = title; c.content = content; c.groupId = editingCard.groupId; }
    } else {
      DB.cards.unshift({ id: uid('c_'), title: title, content: content, groupId: editingCard.groupId, disabled: false, createdAt: Date.now() });
    }
    saveDB();
    closeSheets();
    renderLibrary();
    renderCardPick();
    toast('已保存');
  }

  function deleteCard() {
    if (!editingCard || !editingCard.id) return;
    DB.cards = DB.cards.filter(function (c) { return c.id !== editingCard.id; });
    saveDB();
    closeSheets();
    renderLibrary();
    renderCardPick();
    toast('已删除');
  }

  function runDedup() {
    var seen = {};
    var before = DB.cards.length;
    DB.cards = DB.cards.filter(function (c) {
      var key = (c.content || '').trim();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
    var removed = before - DB.cards.length;
    saveDB();
    renderLibrary();
    renderCardPick();
    toast(removed > 0 ? '已清理 ' + removed + ' 条重复字卡' : '没有重复字卡');
  }

  function exportCards() {
    var data = { cards: DB.cards, cardGroups: DB.cardGroups, exportedAt: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '字卡库_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已导出 ' + DB.cards.length + ' 条字卡');
  }

  function importCards(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var cards = Array.isArray(data) ? data : (data.cards || []);
        var groups = Array.isArray(data.cardGroups) ? data.cardGroups : [];
        if (!cards.length) { toast('文件中没有字卡'); return; }
        var idMap = {};
        groups.forEach(function (g) {
          var newId = uid('cg_');
          idMap[g.id] = newId;
          DB.cardGroups.push({ id: newId, name: g.name || '导入分组', color: g.color || randomColor(), disabled: !!g.disabled });
        });
        var added = 0;
        cards.forEach(function (c) {
          if (!c.content) return;
          DB.cards.unshift({
            id: uid('c_'),
            title: c.title || '',
            content: c.content,
            groupId: c.groupId && idMap[c.groupId] ? idMap[c.groupId] : null,
            disabled: !!c.disabled,
            createdAt: Date.now()
          });
          added++;
        });
        saveDB();
        renderLibrary();
        renderCardPick();
        toast('已导入 ' + added + ' 条字卡');
      } catch (e) {
        toast('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
  }

  /* ================= 分组管理 ================= */
  function openGroupMgr() {
    renderGroupMgr();
    openSheet('sheetGroupMgr');
  }

  function renderGroupMgr() {
    var box = $('#groupMgrList');
    if (!DB.cardGroups.length) {
      box.innerHTML = '<div class="gm-empty">还没有分组<br>点右上角「新建」创建</div>';
      return;
    }
    box.innerHTML = DB.cardGroups.map(function (g) {
      var count = cardsByGroup(g.id).length;
      return '<div class="gm-row' + (g.disabled ? ' disabled' : '') + '" data-gid="' + g.id + '">' +
        '<span class="gm-dot" style="background:' + g.color + '"></span>' +
        '<span class="gm-name">' + esc(g.name) + '</span>' +
        '<span class="gm-count">' + count + ' 条</span>' +
        '<div class="gm-actions">' +
        '<button data-act="toggle" title="' + (g.disabled ? '启用' : '屏蔽') + '">' + (g.disabled ? '👁' : '🚫') + '</button>' +
        '<button data-act="edit" title="编辑">' + PENCIL + '</button>' +
        '<button class="danger" data-act="del" title="删除">🗑</button>' +
        '</div></div>';
    }).join('');
  }

  var editingGroup = null;
  function openGroupEdit(g) {
    editingGroup = g ? { id: g.id, name: g.name, color: g.color } : { id: null, name: '', color: randomColor() };
    $('#groupEditTitle').textContent = g ? '编辑分组' : '新建分组';
    $('#groupName').value = editingGroup.name;
    $('#groupDelete').classList.toggle('hidden', !g);
    renderGroupSwatches();
    openSheet('sheetGroupEdit');
    setTimeout(function () { $('#groupName').focus(); }, 280);
  }

  function renderGroupSwatches() {
    $('#groupSwatches').innerHTML = GROUP_COLORS.map(function (c) {
      var active = c === editingGroup.color ? ' active' : '';
      return '<button class="swatch' + active + '" style="background:' + c + '" data-color="' + c + '" aria-label="颜色"></button>';
    }).join('');
  }

  function saveGroup() {
    var name = $('#groupName').value.trim();
    if (!name) { toast('请输入分组名称'); $('#groupName').focus(); return; }
    if (editingGroup.id) {
      var g = cardGroupById(editingGroup.id);
      if (g) { g.name = name; g.color = editingGroup.color; }
    } else {
      DB.cardGroups.push({ id: uid('cg_'), name: name, color: editingGroup.color, disabled: false });
    }
    saveDB();
    closeSheets();
    renderGroupMgr();
    renderLibrary();
    renderCardPick();
    toast('已保存');
  }

  function deleteGroup() {
    if (!editingGroup || !editingGroup.id) return;
    var gid = editingGroup.id;
    DB.cardGroups = DB.cardGroups.filter(function (g) { return g.id !== gid; });
    DB.cards.forEach(function (c) { if (c.groupId === gid) c.groupId = null; });
    saveDB();
    closeSheets();
    renderGroupMgr();
    renderLibrary();
    renderCardPick();
    toast('分组已删除，字卡保留');
  }

  function batchSetGroup(gid) {
    var ids = Object.keys(libSelected);
    if (!ids.length) return;
    ids.forEach(function (id) {
      var c = cardById(id);
      if (c) c.groupId = gid || null;
    });
    saveDB();
    libSelected = {};
    renderLibrary();
    renderCardPick();
    toast('已更新 ' + ids.length + ' 张字卡的分组');
  }

  function batchToggleDisable() {
    var ids = Object.keys(libSelected);
    if (!ids.length) return;
    var anyEnabled = ids.some(function (id) { var c = cardById(id); return c && !c.disabled; });
    ids.forEach(function (id) {
      var c = cardById(id);
      if (c) c.disabled = anyEnabled;
    });
    saveDB();
    libSelected = {};
    renderLibrary();
    toast(anyEnabled ? '已屏蔽选中字卡' : '已启用选中字卡');
  }

  function batchDelete() {
    var ids = Object.keys(libSelected);
    if (!ids.length) return;
    if (!confirm('删除选中的 ' + ids.length + ' 张字卡？')) return;
    DB.cards = DB.cards.filter(function (c) { return !libSelected[c.id]; });
    libSelected = {};
    saveDB();
    renderLibrary();
    renderCardPick();
    toast('已删除');
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    /* 顶部 */
    $('#btnPlus').addEventListener('click', function (e) {
      e.stopPropagation();
      if (activeTab === 'contacts') {
        openFriendsSheet();
        return;
      }
      $('#plusMenu').classList.contains('open') ? closeMenu() : openMenu();
    });
    $('#mask').addEventListener('click', closeMenu);
    $('#btnSearch').addEventListener('click', function () {
      this.classList.add('active');
      setTimeout(function () { $('#btnSearch').classList.remove('active'); }, 220);
    });

    /* 加号菜单 */
    $('#plusMenu').addEventListener('click', function (e) {
      var item = e.target.closest('.menu-item');
      if (!item) return;
      closeMenu();
      var action = item.dataset.action;
      if (action === 'group') openGroupSheet();
      else if (action === 'friend') openFriendsSheet();
      else if (action === 'cards') openLibrary(false);
      else if (action === 'pay') toast('收付款功能待开发');
    });

    /* 底部 tab */
    $('#tabbar').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (tab) switchTab(tab.dataset.tab);
    });

    /* 弹层关闭 */
    $('#sheetMask').addEventListener('click', closeSheets);
    $$('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', closeSheets);
    });

    /* 好友列表 */
    $('#friendList').addEventListener('click', function (e) {
      var row = e.target.closest('.friend-row');
      if (row) openFriendEdit(friendById(row.dataset.fid));
    });
    $('#friendAddBtn').addEventListener('click', function () { openFriendEdit(null); });
    $('#friendEditCancel').addEventListener('click', closeSheets);
    $('#friendSave').addEventListener('click', saveFriend);
    $('#friendDelete').addEventListener('click', deleteFriend);
    $('#friendName').addEventListener('input', function () {
      editingFriend.name = this.value;
      if (!editingFriend.avatar) renderAvatarEditor();
    });
    $('#friendRegion').addEventListener('input', function () {
      editingFriend.region = this.value;
    });
    $('#swatches').addEventListener('click', function (e) {
      var sw = e.target.closest('.swatch');
      if (!sw) return;
      editingFriend.color = sw.dataset.color;
      editingFriend.avatar = null;
      renderAvatarEditor();
    });
    $('#avatarFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      shrinkImage(file, function (data) {
        if (data) {
          editingFriend.avatar = data;
          renderAvatarEditor();
        } else {
          toast('图片处理失败');
        }
      });
      this.value = '';
    });

    /* 发起群聊 */
    $('#groupList').addEventListener('click', function (e) {
      if (e.target.closest('#emptyAddFriend')) {
        openFriendsSheet();
        return;
      }
      var row = e.target.closest('.pick');
      if (!row) return;
      var id = row.dataset.fid;
      if (selected[id]) {
        delete selected[id];
        row.classList.remove('selected');
      } else {
        selected[id] = 1;
        row.classList.add('selected');
      }
      $('#groupDone').disabled = !Object.keys(selected).length;
    });
    $('#groupDone').addEventListener('click', createGroupFromSelection);

    /* 通讯录 */
    $('#contactsList').addEventListener('click', function (e) {
      if (e.target.closest('#newFriendRow')) {
        openFriendsSheet();
        return;
      }
      var row = e.target.closest('.contact-row');
      if (row) openProfile(row.dataset.fid);
    });
    $('#indexRail').addEventListener('click', function (e) {
      var s = e.target.closest('span');
      if (!s) return;
      var target = document.getElementById('grp-' + s.dataset.letter);
      if (target) target.scrollIntoView({ block: 'start' });
    });

    /* 会话列表 / 详情 */
    $('#chatList').addEventListener('click', function (e) {
      var cell = e.target.closest('.cell');
      if (cell) openChat(cell.dataset.gid);
    });
    $('#chatBack').addEventListener('click', function () {
      if (replyTimer) { clearTimeout(replyTimer); replyTimer = null; }
      hideTyping();
      closeScreen('pageChatDetail');
      closePanels();
      activeGroupId = null;
    });
    $('#chatMore').addEventListener('click', openChatSettings);
    $('#msgInput').addEventListener('input', updateSendState);
    $('#msgInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendText();
      }
    });
    $('#sendBtn').addEventListener('click', sendText);
    $('#msgArea').addEventListener('click', function (e) {
      var av = e.target.closest('.av[data-uid]');
      if (av) {
        if (av.dataset.uid === '__me__') openMyProfile();
        else openProfile(av.dataset.uid);
        return;
      }
      if (e.target.closest('.bubble.voice')) { toast('语音播放（模拟）'); return; }
      if (!e.target.closest('.msg')) {
        closePanels();
        if (document.activeElement === $('#msgInput')) $('#msgInput').blur();
      }
    });

    /* 语音 / 表情 / 加号 */
    $('#voiceToggle').addEventListener('click', function () {
      setVoiceMode(!voiceMode);
    });
    $('#holdTalk').addEventListener(PDOWN, function (e) {
      e.preventDefault();
      startRec(e);
    });
    document.addEventListener(PUP, function () { stopRec(false); });
    document.addEventListener(PCANCEL, function () { stopRec(true); });
    $('#emojiToggle').addEventListener('click', function () {
      if ($('#emojiPanel').classList.contains('hidden')) openEmojiPanel();
      else closePanels();
    });
    $('#plusToggle').addEventListener('click', function () {
      if ($('#plusPanel').classList.contains('hidden')) openPlusPanel();
      else closePanels();
    });
    $('#emojiPanel').addEventListener('click', function (e) {
      var tab = e.target.closest('.panel-tab');
      if (tab) { switchEmojiTab(tab.dataset.etab); return; }
      if (e.target.closest('#manageCards')) {
        if (emojiTab === 'cards') openLibrary(true);
        else openEmojiMgr();
        return;
      }
      var libChip = e.target.closest('#emojiLibBar .chip');
      if (libChip) {
        if (libChip.dataset.egid === '__mgr__') openEmojiMgr();
        else {
          emojiGroupId = libChip.dataset.egid;
          renderEmojiLibBar();
          renderEmojiGrid();
        }
        return;
      }
      var filt = e.target.closest('#cardPickFilter .chip');
      if (filt) {
        cardPickFilter = filt.dataset.gid === '' ? null : filt.dataset.gid;
        renderCardPick();
        return;
      }
      var emoImg = e.target.closest('[data-emoji-img]');
      if (emoImg) {
        var eg = activeEmojiGroup();
        var eitem = eg && eg.items[+emoImg.dataset.emojiImg];
        if (eitem && typeof eitem === 'object') {
          sendMsg({ type: 'sticker', text: eitem.name, sticker: eitem.src });
        }
        return;
      }
      var emo = e.target.closest('[data-emoji]');
      if (emo) { sendMsg({ type: 'sticker', text: emo.dataset.emoji }); return; }
      var cp = e.target.closest('.card-pick-item');
      if (cp) {
        var c = cardById(cp.dataset.cid);
        if (c) {
          sendMsg({ type: 'card', title: c.title, text: c.content });
          closePanels();
        }
      }
    });
    $('#plusPanel').addEventListener('click', function (e) {
      var dot = e.target.closest('#plusDots i');
      if (dot) {
        setPlusPage($$('#plusDots i').indexOf(dot));
        return;
      }
      var item = e.target.closest('.plus-item');
      if (item) onPlusAction(item.dataset.plus);
    });
    var swipeX = null;
    $('#plusTrack').addEventListener('touchstart', function (e) {
      swipeX = e.touches[0].clientX;
    }, { passive: true });
    $('#plusTrack').addEventListener('touchend', function (e) {
      if (swipeX == null) return;
      var dx = e.changedTouches[0].clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 36) setPlusPage(dx < 0 ? 1 : 0);
    }, { passive: true });

    /* 消息设置 */
    $('#swPinned').addEventListener('click', function () {
      var g = groupById(activeGroupId);
      if (!g) return;
      g.pinned = !g.pinned;
      this.classList.toggle('active', g.pinned);
      saveDB();
      renderChatList();
      toast(g.pinned ? '已置顶聊天' : '已取消置顶');
    });
    $('#swMuted').addEventListener('click', function () {
      var g = groupById(activeGroupId);
      if (!g) return;
      g.muted = !g.muted;
      this.classList.toggle('active', g.muted);
      saveDB();
      renderChatList();
      toast(g.muted ? '已开启消息免打扰' : '已关闭消息免打扰');
    });
    $('#bgSwatches').addEventListener('click', function (e) {
      var b = e.target.closest('.bg-swatch');
      var g = groupById(activeGroupId);
      if (!b || !g) return;
      g.bg = b.dataset.bg;
      saveDB();
      applyBg(g.bg);
      $$('#bgSwatches .bg-swatch').forEach(function (x) { x.classList.toggle('active', x === b); });
      toast('聊天背景已更新');
    });
    $('#clearChat').addEventListener('click', function () {
      var g = groupById(activeGroupId);
      if (!g) return;
      if (!g.messages.length) { toast('还没有聊天记录'); return; }
      if (!confirm('清空当前聊天记录？')) return;
      g.messages = [];
      saveDB();
      renderMessages();
      renderChatList();
      closeSheets();
      toast('已清空');
    });

    /* 通话 */
    $('#sheetCallOptions').addEventListener('click', function (e) {
      var row = e.target.closest('[data-callmode]');
      if (row) startCall(row.dataset.callmode);
    });
    $('#callScreen').addEventListener('click', function (e) {
      var btn = e.target.closest('.call-btn');
      if (!btn) return;
      if (btn.dataset.callbtn === 'hangup') hangupCall();
      else btn.classList.toggle('active');
    });

    /* 字卡库 */
    $('#libraryBack').addEventListener('click', closeLibrary);
    $('#cardAdd').addEventListener('click', function () { openCardEdit(null); });
    $('#libSearchBtn').addEventListener('click', function () {
      var bar = $('#libSearchBar');
      bar.classList.toggle('hidden');
      if (!bar.classList.contains('hidden')) setTimeout(function () { $('#libSearchInput').focus(); }, 100);
      else { libSearch = ''; $('#libSearchInput').value = ''; renderLibrary(); }
    });
    $('#libSearchInput').addEventListener('input', function () { libSearch = this.value; renderLibrary(); });
    $('#libSearchClear').addEventListener('click', function () { libSearch = ''; $('#libSearchInput').value = ''; renderLibrary(); });
    $('#libBatchBtn').addEventListener('click', toggleBatchMode);
    $('#libFilterBar').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var gid = chip.dataset.gid;
      if (gid === '') libFilterGroup = null;
      else if (gid === '__none__') libFilterGroup = '';
      else libFilterGroup = gid;
      renderLibrary();
    });
    $('#cardList').addEventListener('click', function (e) {
      if (e.target.closest('#emptyNewCard')) { openCardEdit(null); return; }
      var row = e.target.closest('.card-row');
      if (!row) return;
      var cid = row.dataset.cid;
      if (libBatchMode) {
        if (libSelected[cid]) delete libSelected[cid];
        else libSelected[cid] = true;
        updateBatchBar();
        renderLibrary();
        return;
      }
      if (e.target.closest('.row-edit')) { openCardEdit(cardById(cid)); return; }
      var card = cardById(cid);
      if (card) copyText(card.content);
    });
    $('#libBatchGroup').addEventListener('click', function () {
      var ids = Object.keys(libSelected);
      if (!ids.length) { toast('请先选择字卡'); return; }
      if (!DB.cardGroups.length) { toast('请先创建分组'); openGroupMgr(); return; }
      var names = DB.cardGroups.map(function (g, i) { return (i + 1) + '. ' + g.name; }).join('\n');
      var choice = prompt('选择分组（输入序号，0 为取消分组）：\n' + names);
      if (choice == null) return;
      var n = parseInt(choice);
      if (isNaN(n) || n < 0 || n > DB.cardGroups.length) { toast('无效序号'); return; }
      batchSetGroup(n === 0 ? null : DB.cardGroups[n - 1].id);
    });
    $('#libBatchDisable').addEventListener('click', batchToggleDisable);
    $('#libBatchDelete').addEventListener('click', batchDelete);
    $('#libGroupMgr').addEventListener('click', openGroupMgr);
    $('#libDedup').addEventListener('click', runDedup);
    $('#libExport').addEventListener('click', exportCards);
    $('#libImport').addEventListener('click', function () { $('#libImportFile').click(); });
    $('#libImportFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) importCards(f);
      this.value = '';
    });
    $('#libSettings').addEventListener('click', openAppSettings);
    $('#cardSave').addEventListener('click', saveCard);
    $('#cardDelete').addEventListener('click', deleteCard);
    $('#cardGroupChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      editingCard.groupId = chip.dataset.gid || null;
      renderCardGroupChips();
    });

    /* 分组管理 */
    $('#groupAddBtn').addEventListener('click', function () { openGroupEdit(null); });
    $('#groupMgrList').addEventListener('click', function (e) {
      var row = e.target.closest('.gm-row');
      if (!row) return;
      var g = cardGroupById(row.dataset.gid);
      if (!g) return;
      var btn = e.target.closest('button');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'toggle') { g.disabled = !g.disabled; saveDB(); renderGroupMgr(); renderLibrary(); toast(g.disabled ? '分组已屏蔽' : '分组已启用'); }
      else if (act === 'edit') { openGroupEdit(g); }
      else if (act === 'del') {
        if (confirm('删除分组「' + g.name + '」？（字卡不会被删除）')) {
          DB.cardGroups = DB.cardGroups.filter(function (x) { return x.id !== g.id; });
          DB.cards.forEach(function (c) { if (c.groupId === g.id) c.groupId = null; });
          saveDB(); renderGroupMgr(); renderLibrary(); renderCardPick(); toast('已删除分组');
        }
      }
    });
    $('#groupSave').addEventListener('click', saveGroup);
    $('#groupDelete').addEventListener('click', deleteGroup);
    $('#groupSwatches').addEventListener('click', function (e) {
      var sw = e.target.closest('.swatch');
      if (!sw) return;
      editingGroup.color = sw.dataset.color;
      renderGroupSwatches();
    });
    $('#groupName').addEventListener('input', function () { editingGroup.name = this.value; });

    /* 表情库管理 */
    $('#emojiGroupAddBtn').addEventListener('click', function () { openEmojiEdit(null); });
    $('#emojiMgrList').addEventListener('click', function (e) {
      var row = e.target.closest('.emoji-mgr-row');
      if (row) openEmojiEdit(emojiGroupById(row.dataset.egid));
    });
    $('#emojiGroupSave').addEventListener('click', saveEmojiGroup);
    $('#emojiGroupDelete').addEventListener('click', deleteEmojiGroup);
    $('#emojiImportFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) importEmojiFile(f);
      this.value = '';
    });
    $('#emojiImgFile').addEventListener('change', function () {
      importEmojiImages(this.files);
      this.value = '';
    });
    $('#emojiImgList').addEventListener('input', function (e) {
      var inp = e.target.closest('.emoji-img-name');
      if (!inp) return;
      var it = editingEmojiImages[+inp.dataset.idx];
      if (it) it.name = inp.value;
    });
    $('#emojiImgList').addEventListener('click', function (e) {
      var del = e.target.closest('.emoji-img-del');
      if (!del) return;
      editingEmojiImages.splice(+del.dataset.idx, 1);
      renderEmojiImgList();
    });

    /* 全局设置 */
    $('#swTyping').addEventListener('click', function () {
      DB.settings.typingIndicatorEnabled = !DB.settings.typingIndicatorEnabled;
      this.classList.toggle('active', DB.settings.typingIndicatorEnabled);
      saveDB();
    });
    $('#delayMin').addEventListener('change', function () {
      var v = parseInt(this.value) || 0;
      DB.settings.replyDelayMin = Math.max(0, v);
      if (DB.settings.replyDelayMin > DB.settings.replyDelayMax) DB.settings.replyDelayMax = DB.settings.replyDelayMin;
      saveDB();
    });
    $('#delayMax').addEventListener('change', function () {
      var v = parseInt(this.value) || 0;
      DB.settings.replyDelayMax = Math.max(DB.settings.replyDelayMin, v);
      this.value = DB.settings.replyDelayMax;
      saveDB();
    });
    $$('.delay-presets button').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = this.dataset.preset.split(',');
        DB.settings.replyDelayMin = parseInt(parts[0]);
        DB.settings.replyDelayMax = parseInt(parts[1]);
        $('#delayMin').value = DB.settings.replyDelayMin;
        $('#delayMax').value = DB.settings.replyDelayMax;
        saveDB();
        toast('已应用');
      });
    });

    /* 自动回复开关 */
    $('#swAutoReply').addEventListener('click', function () {
      var g = groupById(activeGroupId);
      if (!g || g.memberIds.length !== 1) return;
      var f = friendById(g.memberIds[0]);
      if (!f) return;
      f.autoReply = !f.autoReply;
      this.classList.toggle('active', f.autoReply);
      saveDB();
      toast(f.autoReply ? '已开启自动回复' : '已关闭自动回复');
    });

    /* 好友资料 */
    $('#profileBack').addEventListener('click', function () { closeScreen('pageProfile'); });
    $('#profileEdit').addEventListener('click', function () {
      if (profileIsMe) openMyEdit();
      else openFriendEdit(friendById(activeFriendId));
    });
    $('#profileMore').addEventListener('click', function () { toast('更多功能待开发'); });
    $('#profileAvatar').addEventListener('click', function () { $('#profileAvatarFile').click(); });
    $('#profileAvatarFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      shrinkImage(file, function (data) {
        if (!data) { toast('图片处理失败'); return; }
        if (profileIsMe) {
          DB.me.avatar = data;
          saveDB();
          renderProfile();
          renderMessages();
          toast('头像已更新');
          return;
        }
        var f = friendById(activeFriendId);
        if (!f) { toast('图片处理失败'); return; }
        f.avatar = data;
        saveDB();
        renderProfile();
        renderContacts();
        renderChatList();
        toast('头像已更新');
      });
      this.value = '';
    });
    $('#profileRegionRow').addEventListener('click', openRegionSheet);
    $('#regionSave').addEventListener('click', saveRegion);
    $('#profileChat').addEventListener('click', function () {
      if (profileIsMe) return;
      var gid = findOrCreateSingle(activeFriendId);
      closeScreen('pageProfile');
      renderChatList();
      openChat(gid);
    });
    $('#profileCall').addEventListener('click', function () {
      if (profileIsMe) return;
      var gid = findOrCreateSingle(activeFriendId);
      renderChatList();
      openCallOptions(gid);
    });
  }

  /* ================= 启动 ================= */
  function initSplash() {
    var splash = $('#splash');
    setTimeout(function () {
      splash.classList.add('hide');
      setTimeout(function () { splash.remove(); }, 360);
    }, 2000);
  }

  function fitPhone() {
    var phone = $('#phone');
    if (window.innerWidth <= 520) {
      phone.style.transform = '';
      return;
    }
    var scale = Math.min(1, (window.innerHeight - 24) / 844, (window.innerWidth - 24) / 390);
    phone.style.transform = 'scale(' + scale + ')';
    phone.style.transformOrigin = 'center center';
  }

  function init() {
    $('#batteryNum').textContent = Math.round(72 + Math.random() * 18);
    clockLoop();
    renderChatList();
    renderContacts();
    bindEvents();
    fitPhone();
    window.addEventListener('resize', fitPhone);
    initSplash();
    tickStatuses();
  }

  init();
})();
