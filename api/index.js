const app = require('express')();
const { JSDOM } = require('jsdom');
const { groupBy } = require('lodash');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
require('dotenv').config();

const cache = new NodeCache({ stdTTL: 86400 });
const PORT = process.env.PORT || 3000;
const URL = 'https://www.pro-football-reference.com/years/2023';

app.listen(PORT, () => {
  console.log(`Running on port on http://localhost:${PORT}`);
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
  res.send('NFL stats API');
});

app.get('/standings', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

    // check if cache has standings
    const cachedData = cache.get('standings');
    if (cachedData) {
      console.log('Found cached data');
      return res.send(cachedData);
    }

    const externalRes = await fetch(URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/html',
      },
    });
    const scrapedData = await externalRes.text();
    const afcStandings = extractStandings('AFC', scrapedData);
    const nfcStandings = extractStandings('NFC', scrapedData);

    // afc
    let htmlDiv = `<div style='display: flex; gap: 40px; justify-content: center;'>`;
    const afcTable = constructHtmlTable(afcStandings, 'AFC');
    htmlDiv += afcTable;

    // nfc
    const nfcTable = constructHtmlTable(nfcStandings, 'NFC');
    htmlDiv += nfcTable;

    htmlDiv += '</div>';

    cache.set('standings', htmlDiv);
    res.send(htmlDiv);
  } catch (e) {
    console.error('Error getting results', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Constructs an HTML table from list data.
 *
 * @param {Array} data - List data to convert into an HTML table.
 * @param {String} header - Header for the HTML table.
 * @returns {String} HTML string.
 */
function constructHtmlTable(data, header) {
  const htmlDiv = `<div class='conference_wrapper'><h1 style="font-size: 28px;">${header}</h1>`;

  if (!data || !data.length) {
    return '<p>No data available</p>';
  }

  let tableHeader = '<tr>';
  for (const key of Object.keys(data[0])) {
    if (key !== 'division') {
      if (key === 'team') {
        tableHeader += '<th></th>';
      } else {
        tableHeader += `<th style="padding: 5px;">${
          key.charAt(0).toUpperCase() + key.slice(1)
        }</th>`;
      }
    }
  }

  tableHeader += '</tr>';

  // group by division
  const groupedData = groupBy(data, 'division');

  // build html table for each group
  let tableRows = '';
  let i = 0;
  for (const [division, group] of Object.entries(groupedData)) {
    const rows = group
      .map(
        (row) =>
          '<tr>' +
          Object.entries(row)
            .filter(([key]) => key !== 'division')
            .map(([key, value]) => `<td style="padding: 5px;">${value}</td>`)
            .join('') +
          '</tr>'
      )
      .join('');
    tableRows += `<tr><td style='font-weight: bold;' colspan='${
      Object.keys(data[0]).length
    }'>${division}</td></tr>${rows}`;

    // add empty row
    if (i < Object.keys(groupedData).length - 1) {
      tableRows += '<tr><td></td></tr>';
    }
    i++;
  }

  const htmlTable = `<table>${tableHeader}${tableRows}</table>`;
  const result = `${htmlDiv}${htmlTable}</div>`;
  return result;
}

/**
 *
 * @param {*} tableId
 * @param {*} html
 * @returns
 */
function extractStandings(tableId, html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const standingsTable = document.getElementById(tableId);

  if (standingsTable) {
    const rows = standingsTable.querySelectorAll(
      'tbody tr, tbody td, tbody th'
    );
    const standings = [];

    let currentDivision = null;
    let currentTeam = null;

    rows.forEach((row) => {
      const dataStat = row.getAttribute('data-stat');
      if (dataStat === 'onecell') {
        currentDivision = row.textContent.trim();
        currentTeam = null;
      } else if (dataStat === 'team') {
        currentTeam = {
          team: row.textContent.trim(),
          division: currentDivision,
        };
        standings.push(currentTeam);
      } else if (
        dataStat &&
        currentTeam &&
        (dataStat === 'wins' || dataStat === 'losses')
      ) {
        currentTeam[dataStat === 'wins' ? 'W' : 'L'] = row.textContent.trim();
      }
    });

    return standings;
  } else {
    console.log(`Standings table with ID ${tableId} cannot be found.`);
    return null;
  }
}

module.exports = app;
