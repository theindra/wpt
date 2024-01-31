// These tests ensure that:
//   1. The HTML element insertion steps for iframes [1] can synchronously run
//      script during iframe insertion, which can observe an iframe's
//      participation in the DOM tree mid-insertion.
//   2. The HTML element removing steps for iframes [2] *do not* synchronously
//      run script during child navigable destruction. Therefore, script cannot
//      observe the state of the DOM in the middle of iframe removal, even when
//      multiple iframes are being removed in the same task. Iframe removal,
//      from the perspective of the parent's DOM tree, is atomic.
//
// [1]: https://html.spec.whatwg.org/C#the-iframe-element:html-element-insertion-steps
// [2]: https://html.spec.whatwg.org/C#the-iframe-element:html-element-removing-steps

promise_test(async t => {
  const fragment = new DocumentFragment();

  const iframe1 = fragment.appendChild(document.createElement('iframe'));
  const iframe2 = fragment.appendChild(document.createElement('iframe'));

  t.add_cleanup(() => {
    iframe1.remove();
    iframe2.remove();
  });

  let iframe1Loaded = false, iframe2Loaded = false;
  iframe1.onload = e => {
    iframe1Loaded = true;
    assert_equals(window.frames.length, 1,
        "iframe1 load event can observe its own participation in the frame tree");
    assert_equals(iframe1.contentWindow, window.frames[0]);
  };

  iframe2.onload = e => {
    iframe2Loaded = true;
    assert_equals(window.frames.length, 2,
        "iframe2 load event can observe its own participation in the frame tree");
    assert_equals(iframe1.contentWindow, window.frames[0]);
    assert_equals(iframe2.contentWindow, window.frames[1]);
  };

  // Synchronously consecutively adds both `iframe1` and `iframe2` to the DOM,
  // invoking their insertion steps (and thus firing each of their `load`
  // events) in order. `iframe1` will be able to observe itself in the DOM but
  // not `iframe2`, and `iframe2` will be able to observe both itself and
  // `iframe1`.
  document.body.append(fragment);
  assert_true(iframe1Loaded, "iframe1 loaded");
  assert_true(iframe2Loaded, "iframe2 loaded");
}, "Insertion steps: load event fires synchronously during iframe insertion steps");

promise_test(async t => {
  const div = document.createElement('div');

  const iframe1 = div.appendChild(document.createElement('iframe'));
  const iframe2 = div.appendChild(document.createElement('iframe'));
  document.body.append(div);

  // Now that both iframes have been inserted into the DOM, we'll set up a
  // MutationObserver that we'll use to ensure that multiple synchronous
  // mutations (removals) are only observed atomically at the end. Specifically,
  // the observer's callback is not invoked synchronously for each removal.
  let observerCallbackInvoked = false;
  const removalObserver = new MutationObserver(mutations => {
    assert_false(observerCallbackInvoked,
        "MO callback is only invoked once, not multiple times, i.e., for " +
        "each removal");
    observerCallbackInvoked = true;
    assert_equals(mutations.length, 1, "Exactly one MutationRecord are recorded");
    assert_equals(mutations[0].removedNodes.length, 2);
    assert_equals(window.frames.length, 0,
        "No iframe Windows exist when the MO callback is run");
    assert_equals(document.querySelector('iframe'), null,
        "No iframe elements are connected to the DOM when the MO callback is " +
        "run");
  });

  removalObserver.observe(div, {childList: true});
  t.add_cleanup(() => removalObserver.disconnect());

  let iframe1UnloadFired = false, iframe2UnloadFired = false;
  iframe1.contentWindow.addEventListener('unload', e => iframe1UnloadFired = true);
  iframe2.contentWindow.addEventListener('unload', e => iframe2UnloadFired = true);

  // replaceChildren() will trigger the synchronous removal of each of `div`'s
  // (iframe) children. This will synchronously, consecutively invoke HTML's
  // "destroy a child navigable" (per [1]), for each iframe.
  //
  // [1]: https://html.spec.whatwg.org/C#the-iframe-element:destroy-a-child-navigable
  div.replaceChildren();
  assert_false(iframe1UnloadFired, "iframe1 unload did not fire");
  assert_false(iframe2UnloadFired, "iframe2 unload did not fire");

  assert_false(observerCallbackInvoked,
      "MO callback is not invoked synchronously after removals");

  // Wait one microtask.
  await Promise.resolve();

  assert_true(observerCallbackInvoked, "MO callback is invoked asynchronously after removals");
}, "Removing steps: script does not run synchronously during iframe destruction");
