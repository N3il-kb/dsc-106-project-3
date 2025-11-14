const W = 980, H = 400, M = {t:20,r:20,b:30,l:48};
const HC = 80, MC = {t:10,r:20,b:20,l:48}; // context

let currentSeries = [];
let markHover = false; 
const scenarioPretty = {
  ssp126: "SSP1-2.6",
  ssp245: "SSP2-4.5",
  ssp370: "SSP3-7.0",
  ssp585: "SSP5-8.5"
};


const parse = d3.autoType;
const color = d3.scaleOrdinal()
  .domain(["ssp126","ssp245","ssp370","ssp585"])
  .range(["#1f77b4","#2ca02c","#ff7f0e","#d62728"]); // blue/green/orange/red

const yParis = [1.5, 2.0];

const tip = d3.select("#tooltip");

let data, countriesAll;
let state = {
  countries: [],
  scenarios: new Set(["ssp126","ssp245","ssp370","ssp585"]),
  smooth: 5,
  xDomain: [2015, 2100],
  yAuto: true
};

const focus = d3.select("#focus")
  .attr("viewBox", [0,0,W,H]);
const gF = focus.append("g").attr("transform", `translate(${M.l},${M.t})`);
const innerW = W - M.l - M.r, innerH = H - M.t - M.b;

const context = d3.select("#context")
  .attr("viewBox", [0,0,W,HC]);
const gC = context.append("g").attr("transform", `translate(${MC.l},${MC.t})`);
const innerWC = W - MC.l - MC.r, innerHC = HC - MC.t - MC.b;

const x = d3.scaleLinear().range([0, innerW]).domain([2015,2100]);
const y = d3.scaleLinear().range([innerH, 0]).domain([0, 6]); // will update
const xC = d3.scaleLinear().range([0, innerWC]).domain([2015,2100]);
const yC = d3.scaleLinear().range([innerHC, 0]).domain([0, 3.5]);

const xAxis = (g, scale) => g.call(d3.axisBottom(scale).tickFormat(d3.format("d")));
const yAxis = (g) => g.call(d3.axisLeft(y));
const line = d3.line()
  .x(d => x(d.year))
  .y(d => y(d.anom));

function smoothSeries(arr, k) {
  if (k<=1) return arr;
  const w = (k|0), r = (w-1)/2;
  return arr.map((d,i) => {
    const a = Math.max(0, i-r), b = Math.min(arr.length-1, i+r);
    const m = d3.mean(arr.slice(a, b+1), e => e.anom);
    return {...d, anom: m};
  });
}

function firstCrossing(series, thresh) {
  for (let i=1;i<series.length;i++){
    if (series[i-1].anom < thresh && series[i].anom >= thresh) {
      // linear interpolate
      const y0 = series[i-1].anom, y1 = series[i].anom, x0 = series[i-1].year, x1 = series[i].year;
      const t = (thresh - y0) / (y1 - y0);
      return x0 + t*(x1-x0);
    }
  }
  return null;
}

function render() {
  // If no countries selected, clear chart and show message
  if (!state.countries.length) {
    gF.selectAll(".series").remove();
    gF.selectAll(".mark").remove();
    gF.selectAll(".paris").remove();
    gF.selectAll(".band").remove();
    d3.select("#summary").text("Select one or more countries to see their warming projections.");
    return;
  }

  // 1) Filter by selected countries and scenarios
  const filtered = data.filter(d =>
    state.countries.includes(d.country) &&
    state.scenarios.has(d.scenario)
  );

  // 2) Aggregate across selected countries:
  //    scenario -> year -> mean anomaly
  const aggregated = d3.rollup(
    filtered,
    v => d3.mean(v, d => d.anom),
    d => d.scenario,
    d => d.year
  );

  // 3) Build series per scenario: sorted array of {scenario, year, anom}
  const scenarioSeries = Array.from(aggregated, ([scenario, yearMap]) => {
    const arr = Array.from(yearMap, ([year, anom]) => ({
      scenario,
      year: +year,
      anom
    })).sort((a, b) => a.year - b.year);

    // apply smoothing
    const smoothed = smoothSeries(arr, state.smooth);
    return { scenario, values: smoothed };
  });

  // 4) Update y-domain if auto, based on brushed x-range
  

  // 5) Axes
  gF.selectAll(".x")
    .data([0])
    .join(enter => enter.append("g").attr("class", "x")
      .attr("transform", `translate(0,${innerH})`))
    .call(xAxis, x);

  gF.selectAll(".y")
    .data([0])
    .join(enter => enter.append("g").attr("class", "y"))
    .call(yAxis);

  gF.selectAll(".x-label").data([0])
  .join("text")
    .attr("class", "x-label")
    .attr("x", innerW / 2)
    .attr("y", innerH + 28)
    .attr("fill", "#ccc")
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .text("Year");

// Y-axis label
gF.selectAll(".y-label").data([0])
  .join("text")
    .attr("class", "y-label")
    .attr("transform", `rotate(-90)`)
    .attr("x", -innerH / 2)
    .attr("y", -38)
    .attr("fill", "#ccc")
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .text("Temperature Anomaly (°C)");

  // 6) Paris bands + lines
  const bands = gF.selectAll(".band").data(yParis);
  bands.join(
    enter => enter.append("path").attr("class", "band")
  )
    .attr("d", d => {
      const x0 = x(state.xDomain[0]);
      const x1 = x(state.xDomain[1]);
      const yTop = y(d);
      const yBottom = y.range()[0];
      return `M${x0},${yTop}L${x1},${yTop}L${x1},${yBottom}L${x0},${yBottom}Z`;
    })
    .attr("fill", "#aaa")
    .attr("fill-opacity", 0.12);

  const pLines = gF.selectAll(".paris").data(yParis);
  pLines.join(
    enter => enter.append("line").attr("class", "paris")
  )
    .attr("x1", 0)
    .attr("x2", innerW)
    .attr("y1", d => y(d))
    .attr("y2", d => y(d))
    .attr("stroke", "#777")
    .attr("stroke-dasharray", "4 4");

  // 7) Lines: one path per scenario
  const scenPaths = gF.selectAll(".series")
    .data(scenarioSeries, d => d.scenario);

  scenPaths.exit().remove();

  scenPaths.enter()
    .append("path")
      .attr("class", "series")
      .attr("fill", "none")
      .attr("stroke-width", 2.2)
    .merge(scenPaths)
      .attr("stroke", d => color(d.scenario))
      .attr("d", d => line(d.values));

  // 8) First-crossing markers for each scenario and Paris threshold
  // 8) First-crossing markers for each scenario and Paris threshold
const markers = [];
scenarioSeries.forEach(s => {
  yParis.forEach(th => {
    const xHit = firstCrossing(s.values, th);
    if (xHit) markers.push({ x: xHit, y: th, scenario: s.scenario });
  });
});

const mk = gF.selectAll(".mark").data(markers);
mk.exit().remove();

mk.enter()
  .append("circle")
    .attr("class", "mark")
    .attr("r", 3.2)
  .merge(mk)
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("fill", d => color(d.scenario))
    .on("mouseover", function (ev, d) {
      markHover = true;          // <-- tell main hover to pause
      hoverLine.style("opacity", 0);  // hide the vertical line

      const yearApprox = Math.round(d.x);  // integer year
const scenLabel = scenarioPretty[d.scenario] || d.scenario.toUpperCase();
const thresh = d.y.toFixed(1);

      const countriesList = state.countries.length
        ? state.countries.join(", ")
        : "selected countries";

      tip
        .style("opacity", 1)
        .style("left", (ev.pageX + 12) + "px")
        .style("top", (ev.pageY - 20) + "px")
        .html(`
          <strong>${scenLabel} crosses ${thresh}&nbsp;°C</strong><br>
          Around year ${yearApprox}<br><br>
          <strong>How this point is calculated:</strong><br>
          1. Compute annual mean temperature for: ${countriesList}.<br>
          2. Convert each year to an anomaly relative to the 1850–1900 model-estimated baseline.<br>
          3. Average anomalies across the selected countries for ${scenLabel}.<br>
          4. Apply a ${state.smooth}-year rolling mean to smooth the curve.<br>
          5. Linearly interpolate the first year where the smoothed line exceeds ${thresh}&nbsp;°C.
        `);
    })
    .on("mouseout", function () {
      tip.style("opacity", 0);
    });


  // 9) Save series for tooltip use
  currentSeries = scenarioSeries;

  // 10) Clear summary for now (you could add text later)
  d3.select("#summary").text("");
}
// --- Hover tooltip + vertical hover line based on aggregated series ---
const hoverLine = gF.append("line")
  .attr("class", "hover-line")
  .attr("y1", 0)
  .attr("y2", innerH)
  .attr("stroke", "#aaa")
  .attr("stroke-width", 1.2)
  .attr("stroke-dasharray", "3 3")
  .style("opacity", 0);

focus
  .on("mousemove", (ev) => {
    // If we are hovering a threshold dot, don't do the main hover tooltip
    if (markHover) return;

    const [mx] = d3.pointer(ev, gF.node());
    const year = Math.round(x.invert(mx));

    const rows = [];
    currentSeries.forEach(s => {
      const pt = s.values.find(d => d.year === year);
      if (pt) rows.push(pt);
    });

    if (!rows.length) {
      hoverLine.style("opacity", 0);
      tip.style("opacity", 0);
      return;
    }

    hoverLine
      .attr("x1", x(year))
      .attr("x2", x(year))
      .style("opacity", 0.6);

    const lines = rows.map(d => {
  const label = scenarioPretty[d.scenario] || d.scenario.toUpperCase();
  return `<span style="color:${color(d.scenario)}">●</span> ` +
         `${label}: ${d.anom.toFixed(2)}&nbsp;°C (mean of selected countries)`;
});

    tip
      .style("opacity", 1)
      .style("left", (ev.pageX + 12) + "px")
      .style("top", (ev.pageY - 20) + "px")
      .html(`<strong>${year}</strong><br>${lines.join("<br>")}`);
  })
  .on("mouseleave", () => {
    if (!markHover) {
      hoverLine.style("opacity", 0);
      tip.style("opacity", 0);
    }
  });



function renderContext() {
  // Remove any old content
  gC.selectAll("*").remove();

  // X-axis at the bottom
  gC.append("g")
    .attr("transform", `translate(0,${innerHC})`)
    .call(xAxis, xC);

  // Brush for selecting zoom window
  const brush = d3.brushX()
    .extent([[0, 0], [innerWC, innerHC]])
    .on("brush end", ({selection}) => {
      if (!selection) return;
      const [x0, x1] = selection.map(xC.invert);
      state.xDomain = [Math.round(x0), Math.round(x1)];
      x.domain(state.xDomain);
      render();
    });

  gC.append("g")
    .attr("class", "brush")
    .call(brush)
    .call(brush.move, [xC(2015), xC(2100)]);
}


d3.csv("data/cmip6_country_anomalies.csv", parse).then(raw => {
  data = raw;
  countriesAll = Array.from(new Set(data.map(d=>d.country))).sort();
  // populate select
  const sel = d3.select("#countrySelect");
  countriesAll.forEach(c => sel.append("option").attr("value",c).text(c));
  // default pick 5
  state.countries = countriesAll.slice(0,5);
  sel.selectAll("option").property("selected", d => state.countries.includes(d));

  sel.on("change", ev => {
    const selected = Array.from(ev.target.selectedOptions).map(o=>o.value);
    state.countries = selected.slice(0,8); // keep it readable
    render();
  });

  d3.selectAll('#controls input[type="checkbox"]').on("change", function(){
    if (this.checked) state.scenarios.add(this.value); else state.scenarios.delete(this.value);
    render();
  });

  d3.select("#smooth").on("input", (ev)=>{
    state.smooth = +ev.target.value;
    d3.select("#smoothLabel").text(state.smooth);
    render();
  });

  d3.select("#yAuto").on("change", ev => {
    state.yAuto = ev.target.checked;
    render();
  });

  render();
  renderContext();
});
