const apiRequest = async (endpoint, payload, method = 'POST') => {
  try {
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (error) {
    return { success: false, message: 'Network error. Please check your connection and try again.' };
  }
};

const apiPost = (endpoint, payload) => apiRequest(endpoint, payload, 'POST');

const initPrayerClock = async () => {
  const widget = document.getElementById('prayerWidget');
  if (!widget) return;

  const locationLabel = document.getElementById('prayerLocation');
  const currentTimeEl = document.getElementById('currentTime');
  const nextPrayerText = document.getElementById('nextPrayerText');
  const prayerIds = ['fajrTime', 'dhuhrTime', 'asrTime', 'maghribTime', 'ishaTime'];

  const formatTime = date => new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);

  const parsePrayerTime = timeText => {
    const cleaned = timeText.replace(/\s+/g, '').replace(/\(.*\)/g, '');
    const [hourStr, minuteStr] = cleaned.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    return hour * 60 + minute;
  };

  const getLocation = async () => {
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
        });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (error) {
        console.warn('Geolocation unavailable, using fallback.', error);
      }
    }

    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      if (data.latitude && data.longitude) {
        return { latitude: data.latitude, longitude: data.longitude, city: data.city, country: data.country_name };
      }
    } catch (error) {
      console.warn('Fallback location lookup failed.', error);
    }

    return { latitude: -6.1622, longitude: 39.2083, city: 'Dar es Salaam', country: 'Tanzania' };
  };

  const renderPrayerTimes = async () => {
    const location = await getLocation();
    const today = new Date().toISOString().slice(0, 10);
    const apiUrl = `https://api.aladhan.com/v1/timings/${today}?latitude=${location.latitude}&longitude=${location.longitude}&method=4`;

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();
      const timings = result?.data?.timings || {};
      const times = [
        ['fajrTime', timings.Fajr],
        ['dhuhrTime', timings.Dhuhr],
        ['asrTime', timings.Asr],
        ['maghribTime', timings.Maghrib],
        ['ishaTime', timings.Isha]
      ];

      times.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && value) element.textContent = value;
      });

      const locationText = location.city && location.country ? `${location.city}, ${location.country}` : 'Your current location';
      locationLabel.textContent = locationText;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const prayerSchedule = [
        { name: 'Fajr', time: parsePrayerTime(timings.Fajr) },
        { name: 'Dhuhr', time: parsePrayerTime(timings.Dhuhr) },
        { name: 'Asr', time: parsePrayerTime(timings.Asr) },
        { name: 'Maghrib', time: parsePrayerTime(timings.Maghrib) },
        { name: 'Isha', time: parsePrayerTime(timings.Isha) }
      ];

      const upcoming = prayerSchedule.find(prayer => prayer.time > currentMinutes) || prayerSchedule[0];
      const nextPrayerLabel = upcoming.name;
      const nextTime = upcoming.time;
      const nextDate = new Date(now);
      nextDate.setHours(Math.floor(nextTime / 60), nextTime % 60, 0, 0);
      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      const diffMs = nextDate - now;
      const diffMins = Math.max(0, Math.floor(diffMs / 60000));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      nextPrayerText.textContent = `${nextPrayerLabel} in ${hours > 0 ? `${hours}h ` : ''}${mins}m`;
    } catch (error) {
      nextPrayerText.textContent = 'Prayer times unavailable right now.';
      console.warn('Prayer times request failed.', error);
    }
  };

  renderPrayerTimes();
  setInterval(() => {
    currentTimeEl.textContent = formatTime(new Date());
  }, 1000);
};

const handleForm = (formId, endpoint, onSuccess) => {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {};
    formData.forEach((value, key) => payload[key] = value);

    const result = await apiPost(endpoint, payload);
    if (result.success) {
      form.reset();
      onSuccess(result);
    } else {
      alert(result.message || 'Submission failed.');
    }
  });
};

const initTabs = () => {
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      button.classList.add('active');
      const panel = document.getElementById(button.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
};

const initMemberRegistrationToggle = () => {
  const form = document.getElementById('memberRegistrationForm');
  if (!form) return;

  const registrationType = form.querySelector('[name="registrationType"]');
  const departmentGroup = document.getElementById('departmentGroup');
  const leadershipRoleGroup = document.getElementById('leadershipRoleGroup');
  const approvalNote = document.getElementById('leaderApprovalNote');

  const toggleLeaderFields = () => {
    const showLeaderFields = registrationType.value === 'leader';
    departmentGroup.classList.toggle('hidden', !showLeaderFields);
    leadershipRoleGroup.classList.toggle('hidden', !showLeaderFields);
    approvalNote.classList.toggle('hidden', !showLeaderFields);
  };

  registrationType.addEventListener('change', toggleLeaderFields);
  toggleLeaderFields();
};

const renderPendingRegistrations = async () => {
  const container = document.getElementById('pendingRegistrations');
  if (!container) return;

  try {
    const response = await fetch('/api/registrations/pending');
    const data = await response.json();
    if (!data.success || !data.payload?.registrations?.length) {
      container.innerHTML = '<div class="pending-item">No pending leader registrations.</div>';
      return;
    }

    container.innerHTML = data.payload.registrations.map(reg => `
      <div class="pending-item">
        <strong>ID:</strong> ${reg.id}<br />
        <strong>Name:</strong> ${reg.full_name}<br />
        <strong>Department:</strong> ${reg.department || 'Not provided'}<br />
        <strong>Role:</strong> ${reg.leadership_role || 'Not provided'}
      </div>
    `).join('');
  } catch (error) {
    container.innerHTML = '<div class="pending-item">Unable to load pending registrations right now.</div>';
  }
};

const handleApproveRegistration = () => {
  const form = document.getElementById('approveRegistrationForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const registrationId = formData.get('registrationId');
    const approvedBy = formData.get('approvedBy') || 'HQ';

    const result = await apiPost(`/api/registrations/${registrationId}/approve`, { approvedBy });
    if (result.success) {
      form.reset();
      document.getElementById('approvalBy').value = 'HQ';
      alert(result.message);
      renderPendingRegistrations();
    } else {
      alert(result.message || 'Approval failed.');
    }
  });
};

const handleOtpVerification = () => {
  const form = document.getElementById('otpVerifyForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const result = await apiPost('/api/verify-otp', Object.fromEntries(new FormData(form)));
    alert(result.message || 'OTP verification completed.');
    if (result.success) form.reset();
  });
};

const handleItConfirmation = () => {
  const form = document.getElementById('itConfirmForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const result = await apiPost('/api/it/confirm-hq', Object.fromEntries(new FormData(form)));
    alert(result.message || 'Confirmation completed.');
    if (result.success) form.reset();
  });
};

const handleMemberEdit = () => {
  const form = document.getElementById('memberEditForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const memberId = formData.get('memberId');
    const payload = Object.fromEntries(formData.entries());
    delete payload.memberId;

    const result = await apiRequest(`/api/memberships/${memberId}`, payload, 'PUT');
    alert(result.message || 'Member update completed.');
    if (result.success) form.reset();
  });
};

const handleMemberLogin = () => {
  const form = document.getElementById('memberLoginForm');
  const panel = document.getElementById('memberProfilePanel');
  const content = document.getElementById('memberProfileContent');
  const logoutBtn = document.getElementById('memberLogoutBtn');

  if (!form || !panel || !content || !logoutBtn) return;

  const renderProfile = data => {
    const membership = data?.membership || {};
    const user = data?.user || {};
    content.innerHTML = `
      <div><strong>Full Name:</strong> ${membership.full_name || 'N/A'}</div>
      <div><strong>Email:</strong> ${membership.email || 'N/A'}</div>
      <div><strong>Phone:</strong> ${membership.phone || 'N/A'}</div>
      <div><strong>Membership Type:</strong> ${membership.member_type || 'N/A'}</div>
      <div><strong>Status:</strong> ${membership.status || 'N/A'}</div>
      <div><strong>Username:</strong> ${user.username || 'N/A'}</div>
    `;
    panel.classList.remove('hidden');
  };

  const clearProfile = () => {
    content.innerHTML = '';
    panel.classList.add('hidden');
  };

  logoutBtn.addEventListener('click', clearProfile);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const result = await apiPost('/api/member/login', Object.fromEntries(new FormData(form)));
    if (result.success) {
      renderProfile(result.payload);
      form.reset();
    } else {
      clearProfile();
      alert(result.message || 'Sign in failed.');
    }
  });
};

window.addEventListener('DOMContentLoaded', () => {
  initPrayerClock();
  initTabs();
  initMemberRegistrationToggle();
  handleForm('contactForm', '/api/contact', result => alert(result.message));
  handleForm('memberRegistrationForm', '/api/register', result => alert(`${result.message}\nRegistration ID: ${result.payload.id}`));
  handleForm('announcementForm', '/api/announcement', result => alert(`${result.message}`));
  handleForm('contributionForm', '/api/contribution', result => alert(`Contribution received. Control Number: ${result.payload.controlNumber}`));
  handleForm('controlVerifyForm', '/api/verify', result => alert(`Verified contribution:\n${JSON.stringify(result.payload, null, 2)}`));
  handleForm('leadersAccessForm', '/api/leader-access', result => alert(result.message));
  handleForm('hqAccessForm', '/api/hq-access', result => alert(result.message));
  handleOtpVerification();
  handleItConfirmation();
  handleMemberEdit();
  handleMemberLogin();
  handleApproveRegistration();
  renderPendingRegistrations();
});
