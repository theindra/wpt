const create_form_for_data = data => {
  const form = new HTMLFormElement();
  for (let key in data) {
    if (data.hasOwnProperty(key)) {
      const input = new HTMLInputElement();
      input.type = key;
      input.value = data[key];
      form.appendChild(input);
    }
  }
  return form;
};
