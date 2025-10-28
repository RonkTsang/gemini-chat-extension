var urlMonitorMainWorld = (function() {
  "use strict";
  function defineUnlistedScript(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  const GEM_EXT_EVENTS = {
    URL_CHANGE: "gem-ext:urlchange"
  };
  const definition = defineUnlistedScript(() => {
    console.log("[URLMonitor Main World] Starting URL monitoring in main world...");
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      emitURLChange();
    };
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      emitURLChange();
    };
    window.addEventListener("popstate", emitURLChange);
    function emitURLChange() {
      const eventData = {
        url: window.location.href,
        timestamp: Date.now()
      };
      window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.URL_CHANGE, {
        detail: eventData
      }));
      console.log("[URLMonitor Main World] URL changed:", eventData.url);
    }
    console.log("[URLMonitor Main World] URL monitoring started successfully");
  });
  function initPlugins() {
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      return await definition.main();
    } catch (err) {
      logger.error(
        `The unlisted script "${"url-monitor-main-world"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsLW1vbml0b3ItbWFpbi13b3JsZC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3d4dEAwLjIwLjExX0B0eXBlcytub2RlQDI0LjUuMl9qaXRpQDIuNS4xX3JvbGx1cEA0LjUwLjIvbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS11bmxpc3RlZC1zY3JpcHQubWpzIiwiLi4vLi4vc3JjL2NvbW1vbi9ldmVudC50cyIsIi4uLy4uL3NyYy9lbnRyeXBvaW50cy91cmwtbW9uaXRvci1tYWluLXdvcmxkLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiBkZWZpbmVVbmxpc3RlZFNjcmlwdChhcmcpIHtcbiAgaWYgKGFyZyA9PSBudWxsIHx8IHR5cGVvZiBhcmcgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHsgbWFpbjogYXJnIH07XG4gIHJldHVybiBhcmc7XG59XG4iLCJpbXBvcnQgeyBOYXZpZ2F0aW9uU2VjdGlvbiB9IGZyb20gXCJAL2NvbXBvbmVudHMvc2V0dGluZy1wYW5lbC9jb25maWdcIjtcblxuLy8g5LqL5Lu25bi46YePXG5leHBvcnQgY29uc3QgR0VNX0VYVF9FVkVOVFMgPSB7XG4gIFVSTF9DSEFOR0U6ICdnZW0tZXh0OnVybGNoYW5nZScsXG59IGFzIGNvbnN0XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwRXZlbnRzIHtcbiAgJ3NldHRpbmdzOm9wZW4nOiB7XG4gICAgZnJvbTogJ3Byb21wdC1lbnRyYW5jZScgfCAncG9wdXAnLFxuICAgIG9wZW46IGJvb2xlYW5cbiAgICBtb2R1bGU/OiBOYXZpZ2F0aW9uU2VjdGlvblxuICB9O1xuICAnc2V0dGluZ3M6Y2xvc2UnOiB7XG4gICAgZnJvbTogJ3J1bi1tb2RhbCcgfCAnbWFudWFsJyxcbiAgICByZWFzb24/OiBzdHJpbmdcbiAgfTtcbiAgJ2V4ZWN1dGlvbjphYm9ydGVkLWJ5LWNoYXQtc3dpdGNoJzoge1xuICAgIHJlYXNvbjogJ2NoYXRfc3dpdGNoZWQnLFxuICAgIG9yaWdpbmFsVXJsOiBzdHJpbmcsXG4gICAgY3VycmVudFVybDogc3RyaW5nLFxuICAgIHRpbWVzdGFtcDogbnVtYmVyXG4gIH07XG4gICdjaGF0b3V0bGluZTpvcGVuJzoge1xuICAgIHNvdXJjZT86IHN0cmluZ1xuICB9O1xufSIsIi8qKlxuICogVVJMIE1vbml0b3IgTWFpbiBXb3JsZCBTY3JpcHRcbiAqIOWcqCBtYWluIHdvcmxkIOS4remHjeWGmSBoaXN0b3J5IOaOpeWPo++8jOajgOa1i+ecn+WunueahOmhtemdouWvvOiIqlxuICovXG5cbmltcG9ydCB7IEdFTV9FWFRfRVZFTlRTIH0gZnJvbSAnQC9jb21tb24vZXZlbnQnXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVVubGlzdGVkU2NyaXB0KCgpID0+IHtcbiAgY29uc29sZS5sb2coJ1tVUkxNb25pdG9yIE1haW4gV29ybGRdIFN0YXJ0aW5nIFVSTCBtb25pdG9yaW5nIGluIG1haW4gd29ybGQuLi4nKVxuICBcbiAgLy8g5L+d5a2Y5Y6f5aeL5pa55rOVXG4gIGNvbnN0IG9yaWdpbmFsUHVzaFN0YXRlID0gaGlzdG9yeS5wdXNoU3RhdGVcbiAgY29uc3Qgb3JpZ2luYWxSZXBsYWNlU3RhdGUgPSBoaXN0b3J5LnJlcGxhY2VTdGF0ZVxuICBcbiAgLy8g6YeN5YaZIHB1c2hTdGF0ZVxuICBoaXN0b3J5LnB1c2hTdGF0ZSA9ICguLi5hcmdzKSA9PiB7XG4gICAgb3JpZ2luYWxQdXNoU3RhdGUuYXBwbHkoaGlzdG9yeSwgYXJncylcbiAgICBlbWl0VVJMQ2hhbmdlKClcbiAgfVxuICBcbiAgLy8g6YeN5YaZIHJlcGxhY2VTdGF0ZVxuICBoaXN0b3J5LnJlcGxhY2VTdGF0ZSA9ICguLi5hcmdzKSA9PiB7XG4gICAgb3JpZ2luYWxSZXBsYWNlU3RhdGUuYXBwbHkoaGlzdG9yeSwgYXJncylcbiAgICBlbWl0VVJMQ2hhbmdlKClcbiAgfVxuICBcbiAgLy8g55uR5ZCsIHBvcHN0YXRlIOS6i+S7tlxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9wc3RhdGUnLCBlbWl0VVJMQ2hhbmdlKVxuICBcbiAgLy8g5Y+R5Ye6IFVSTCDlj5jljJbkuovku7ZcbiAgZnVuY3Rpb24gZW1pdFVSTENoYW5nZSgpIHtcbiAgICBjb25zdCBldmVudERhdGEgPSB7XG4gICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgfVxuICAgIFxuICAgIC8vIOWPkeWHuiBDdXN0b21FdmVudCDliLAgaXNvbGF0ZWQgd29ybGRcbiAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoR0VNX0VYVF9FVkVOVFMuVVJMX0NIQU5HRSwge1xuICAgICAgZGV0YWlsOiBldmVudERhdGFcbiAgICB9KSlcbiAgICBcbiAgICBjb25zb2xlLmxvZygnW1VSTE1vbml0b3IgTWFpbiBXb3JsZF0gVVJMIGNoYW5nZWQ6JywgZXZlbnREYXRhLnVybClcbiAgfVxuICBcbiAgY29uc29sZS5sb2coJ1tVUkxNb25pdG9yIE1haW4gV29ybGRdIFVSTCBtb25pdG9yaW5nIHN0YXJ0ZWQgc3VjY2Vzc2Z1bGx5Jylcbn0pXG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBTyxXQUFTLHFCQUFxQixLQUFLO0FBQ3hDLFFBQUksT0FBTyxRQUFRLE9BQU8sUUFBUSxXQUFZLFFBQU8sRUFBRSxNQUFNLElBQUc7QUFDaEUsV0FBTztBQUFBLEVBQ1Q7QUNBTyxRQUFNLGlCQUFpQjtBQUFBLElBQzVCLFlBQVk7QUFBQSxFQUNkO0FDRUEsUUFBQSxhQUFBLHFCQUFBLE1BQUE7QUFDRSxZQUFBLElBQUEsa0VBQUE7QUFHQSxVQUFBLG9CQUFBLFFBQUE7QUFDQSxVQUFBLHVCQUFBLFFBQUE7QUFHQSxZQUFBLFlBQUEsSUFBQSxTQUFBO0FBQ0Usd0JBQUEsTUFBQSxTQUFBLElBQUE7QUFDQSxvQkFBQTtBQUFBLElBQWM7QUFJaEIsWUFBQSxlQUFBLElBQUEsU0FBQTtBQUNFLDJCQUFBLE1BQUEsU0FBQSxJQUFBO0FBQ0Esb0JBQUE7QUFBQSxJQUFjO0FBSWhCLFdBQUEsaUJBQUEsWUFBQSxhQUFBO0FBR0EsYUFBQSxnQkFBQTtBQUNFLFlBQUEsWUFBQTtBQUFBLFFBQWtCLEtBQUEsT0FBQSxTQUFBO0FBQUEsUUFDSyxXQUFBLEtBQUEsSUFBQTtBQUFBLE1BQ0Q7QUFJdEIsYUFBQSxjQUFBLElBQUEsWUFBQSxlQUFBLFlBQUE7QUFBQSxRQUFnRSxRQUFBO0FBQUEsTUFDdEQsQ0FBQSxDQUFBO0FBR1YsY0FBQSxJQUFBLHdDQUFBLFVBQUEsR0FBQTtBQUFBLElBQWlFO0FBR25FLFlBQUEsSUFBQSw2REFBQTtBQUFBLEVBQ0YsQ0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMF19
urlMonitorMainWorld;