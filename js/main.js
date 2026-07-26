// local-time clock in the header
const clock = document.getElementById("clock");

function tick() {
  clock.textContent = new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    timeZone: "Africa/Lagos",
  });
}

if (clock) {
  tick();
  setInterval(tick, 1000);
}

// reveal sections as they scroll into view
const revealed = document.querySelectorAll(".reveal");

if (revealed.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.1 }
  );

  revealed.forEach((el) => observer.observe(el));
}
