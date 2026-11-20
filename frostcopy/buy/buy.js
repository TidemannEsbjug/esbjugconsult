// The US price calculator. The numbers are the ones in the draft (us-kjopsside/buy.html, November 19, 2026):
// the Norwegian curve in dollars. A straight line in log-log between the points, continuing with the last slope
// above the last point. Nothing here is sent anywhere: the price is calculated in the browser.
// The buttons "Buy a license" and "I have a license" do nothing yet. There is no ordering backend.
(function () {
  var SOLO = 300;
  var CURVE = [[1, 500], [2, 600], [6, 1500], [23, 4500], [113, 12000], [500, 25000], [2000, 45000]];
  // Government: its own table, never above 14,500 dollars a year.
  var GOV = [[1, 240], [5, 590], [20, 1490], [50, 2900], [200, 5900], [1000, 9800], [3000, 14500]];
  var GOV_CAP = 14500;
  // The share of the people on the payroll that is counted. A third number is a factor on the price.
  var BUSINESS = [
    ["Law firm", 1], ["Accounting, tax or bookkeeping", 1], ["Finance or insurance", 1], ["Recruiting or HR services", 1],
    ["Consulting, IT or other office work", 1], ["Real estate", 1], ["Nonprofit or association", 1],
    ["Healthcare", 0.4], ["Schools and education", 0.4], ["Care and social services", 0.4],
    ["Aviation", 0.3, 1.5], ["Retail", 0.2],
    ["Construction and trades", 0.15], ["Manufacturing", 0.15], ["Transport and warehousing", 0.15],
    ["Farming, forestry or fishing", 0.15], ["Mining", 0.15], ["Utilities and waste", 0.15], ["Auto repair", 0.15],
    ["Hotels and restaurants", 0.1], ["Security", 0.1], ["Cleaning and property services", 0.1],
    ["Staffing agency", 0.05],
  ];

  function loglog(points, x) {
    if (x <= points[0][0]) return points[0][1];
    var i = -1;
    for (var k = 0; k < points.length; k++) {
      if (points[k][0] >= x) { i = k; break; }
    }
    if (i === -1) i = points.length - 1;
    var x0 = points[i - 1][0], y0 = points[i - 1][1], x1 = points[i][0], y1 = points[i][1];
    return y0 * Math.exp((Math.log(x / x0) / Math.log(x1 / x0)) * Math.log(y1 / y0));
  }
  function round(p) {
    var step = p < 1000 ? 10 : p < 10000 ? 50 : 100;
    return Math.round(p / step) * step;
  }
  function tall(n) {
    return n.toLocaleString("en-US");
  }

  var people = document.getElementById("people");
  var business = document.getElementById("business");
  var businessField = document.getElementById("businessField");
  if (!people || !business) return;
  BUSINESS.forEach(function (b, i) {
    business.add(new Option(b[0], i));
  });

  function update() {
    var gov = document.querySelector("input[name=kind]:checked").value === "gov";
    businessField.hidden = gov;
    var n = Math.max(1, Math.floor(Number(people.value) || 1));
    var price, how;
    if (gov) {
      price = Math.min(GOV_CAP, round(loglog(GOV, n)));
      how = "Government price for " + tall(n) + (n === 1 ? " person." : " people.") + (price === GOV_CAP ? " This is the highest government price." : "");
    } else if (n === 1) {
      price = SOLO;
      how = "The price for one person working alone.";
    } else {
      var b = BUSINESS[Number(business.value)];
      var share = b[1], factor = b[2] || 1;
      var counted = Math.max(1, n * share);
      price = Math.max(SOLO, round(loglog(CURVE, counted) * factor));
      how = share === 1
        ? "All " + tall(n) + " people are counted."
        : "In " + b[0].toLowerCase() + ", " + Math.round(share * 100) + "% of the people are counted: " + tall(Math.round(counted * 10) / 10) + " of " + tall(n) + ".";
    }
    document.getElementById("amount").textContent = "$" + tall(price);
    document.getElementById("how").textContent = how;
  }
  people.addEventListener("input", update);
  business.addEventListener("change", update);
  Array.prototype.forEach.call(document.querySelectorAll("input[name=kind]"), function (r) {
    r.addEventListener("change", update);
  });
  update();
})();
