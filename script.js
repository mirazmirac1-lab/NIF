const apiPost = async (endpoint, payload) => {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (error) {
    return { success: false, message: 'Network error. Please check your connection and try again.' };
  }
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

window.addEventListener('DOMContentLoaded', () => {
  handleForm('contactForm', '/api/contact', result => alert(result.message));
  handleForm('registrationForm', '/api/membership', result => alert(`${result.message}\nMembership ID: ${result.payload.id}`));
  handleForm('announcementForm', '/api/announcement', result => alert(`${result.message}`));
  handleForm('contributionForm', '/api/contribution', result => alert(`Contribution received. Control Number: ${result.payload.controlNumber}`));
  handleForm('controlVerifyForm', '/api/verify', result => alert(`Verified contribution:\n${JSON.stringify(result.payload, null, 2)}`));
  handleForm('leadersAccessForm', '/api/leader-access', result => alert(result.message));
  handleForm('hqAccessForm', '/api/hq-access', result => alert(result.message));
});
