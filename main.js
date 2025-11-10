const W = 980, H = 400, M = {t:20,r:20,b:30,l:48};
const HC = 80, MC = {t:10,r:20,b:20,l:48}; // context

const parse = d3.autoType;
const color = d3.scaleOrdinal()
  .domain(["ssp126","ssp245","ssp370","ssp585"])
  .range(["#1f77b4","#2ca02c","#ff7f0e","#d62728"]); // blue/green/orange/red

const yParis = [1.5, 2.0];

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
const y = d3.scaleLinear().range([innerH, 0]).domain([0, 3.5]); // will update
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
  // filter + smooth
  const filtered = data.filter(d => state.countries.includes(d.country) && state.scenarios.has(d.scenario));
  const byCountryScenario = d3.group(filtered, d => d.country, d => d.scenario);

  // compute y-domain if auto
  let yMax = 2.5;
  if (state.yAuto) {
    yMax = d3.max([...byCountryScenario.values()].flatMap(map =>
      [...map.values()].flatMap(arr => smoothSeries(arr, state.smooth).map(d => d.anom))
    )) ?? 2.5;
    y.domain([0, Math.max(2, Math.ceil((yMax+0.2)*10)/10)]);
  }

  // axes
  gF.selectAll(".x").data([0]).join(enter => enter.append("g").attr("class","x")
    .attr("transform", `translate(0,${innerH})`)).call(xAxis, x);
  gF.selectAll(".y").data([0]).join(enter => enter.append("g").attr("class","y")).call(yAxis);

  // Paris bands + lines
  const bands = gF.selectAll(".band").data(yParis);
  bands.join(enter => enter.append("path").attr("class","band"))
    .attr("d", d => {
      const x0 = x(state.xDomain[0]);
      const x1 = x(state.xDomain[1]);
      const yTop = y(d);
      const yBottom = y.range()[0]; // fill from the target down to the axis baseline
      return `M${x0},${yTop}L${x1},${yTop}L${x1},${yBottom}L${x0},${yBottom}Z`;
    })
    .attr("fill", "#aaa")
    .attr("fill-opacity", 0.12);
  const pLines = gF.selectAll(".paris").data(yParis);
  pLines.join(enter=>enter.append("line").attr("class","paris"))
    .attr("x1",0).attr("x2",innerW).attr("y1",d=>y(d)).attr("y2",d=>y(d))
    .attr("stroke","#777").attr("stroke-dasharray","4 4");

  // lines
  const countryGroups = gF.selectAll(".country").data([...byCountryScenario], d=>d[0]);
  const cg = countryGroups.join(enter => enter.append("g").attr("class","country"));
  cg.each(function([country, scenMap]) {
    const g = d3.select(this);
    const scen = [...scenMap.keys()];
    const join = g.selectAll(".series").data(scen, s=>s);
    join.join(
      enter => enter.append("path").attr("class","series")
        .attr("fill","none").attr("stroke-width",2.2)
    ).attr("stroke", s=>color(s))
     .attr("d", s => line(smoothSeries(scenMap.get(s), state.smooth)));

    // first-crossing markers for 1.5 and 2.0
    const markers = [];
    scen.forEach(s => {
      const arr = smoothSeries(scenMap.get(s), state.smooth);
      yParis.forEach(th => {
        const xHit = firstCrossing(arr, th);
        if (xHit) markers.push({x:xHit, y:th, scenario:s});
      });
    });
    const mk = g.selectAll(".mark").data(markers);
    mk.join(
      enter => enter.append("circle").attr("class","mark").attr("r",3.2)
    ).attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("fill", d => color(d.scenario));
  });

  // hover tooltip
  const tip = d3.select("#tooltip");
  focus.on("mousemove", (ev) => {
    const [mx,my] = d3.pointer(ev, gF.node());
    const year = Math.round(x.invert(mx));
    const nearby = filtered.filter(d => d.year === year);
    if (!nearby.length) { tip.style("opacity",0); return; }
    const lines = nearby.slice(0,12).map(d => `${d.country} — ${d.scenario.toUpperCase()}: ${d.anom.toFixed(2)}°C`);
    tip.style("opacity",1).style("left", (ev.pageX+12)+"px").style("top", (ev.pageY+12)+"px")
       .html(`<strong>${year}</strong><br>${lines.join("<br>")}`);
  }).on("mouseleave", () => tip.style("opacity",0));

  // summary (brush window)
  d3.select("#summary").text("");
}

function renderContext() {
  // simple backdrop with overall median anomaly to guide brushing
  const grouped = d3.group(data, d=>d.year);
  const med = [...grouped].map(([year, arr]) => ({year, anom: d3.median(arr, d=>d.anom)}));
  const lineC = d3.line().x(d=>xC(d.year)).y(d=>yC(d.anom));
  gC.append("path").attr("d", lineC(med)).attr("fill","none").attr("stroke","#666").attr("stroke-width",1);

  const brush = d3.brushX().extent([[0,0],[innerWC, innerHC]]).on("brush end", ({selection})=>{
    if (!selection) return;
    const [x0,x1] = selection.map(xC.invert);
    state.xDomain = [Math.round(x0), Math.round(x1)];
    x.domain(state.xDomain);
    render();
  });
  gC.append("g").attr("class","brush").call(brush).call(brush.move, [xC(2015), xC(2100)]);
  gC.append("g").attr("transform",`translate(0,${innerHC})`).call(xAxis, xC);
  gC.append("g").call(g=>g.call(d3.axisLeft(yC).ticks(3)));
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
