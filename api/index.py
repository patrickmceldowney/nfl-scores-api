from requests import get
from typing import List, Dict, Union
from bs4 import BeautifulSoup
from tabulate import tabulate
from flask import Flask, render_template_string, abort
from itertools import groupby
import os.path

app = Flask(__name__)

test_path = os.path.join(os.path.dirname(__file__), "test.html")


@app.route("/")
def home():
    return "NFL Stats API"


@app.route("/fixtures")
def fixtures():
    # url = "https://www.pro-football-reference.com/years/2023"
    # response = get(url)

    # if response.status_code == 200:
    # save_html_to_file(response.text)
    html = read_html_from_file("test.html")
    afc_standings = extract_standings("AFC", html)
    nfc_standings = extract_standings("NFC", html)

    # building div
    html_div = "<div style='display: flex; gap:40px;'>"
    afc_table = construct_html_table(afc_standings, "AFC")
    html_div += afc_table

    # NFC
    nfc_table = construct_html_table(nfc_standings, "NFC")
    html_div += nfc_table

    html_div += "</div>"
    headers = {"Content-Type": "text/html"}

    # return raw html
    return render_template_string(html_div), 200, headers


"""Constructs and HTML table from list data

Keyword arguments:
data -- List data to convert into an html table
Return: html string
"""


def construct_html_table(data: List[Dict[str, Union[str, None]]], header: str) -> str:
    html_div = f"<div class='conference_wrapper'><h1>{header}</h1>"
    if not data:
        return "<p>No data available</p>"

    table_header = "<tr>"
    for key in data[0].keys():
        if key != "division":
            if key == "team":
                table_header += "<th></th>"
            else:
                table_header += f"<th>{key.capitalize()}</th>"

    table_header += "</tr>"

    # group by division
    grouped_data = {
        key: list(group) for key, group in groupby(data, key=lambda x: x["division"])
    }

    # build HTML table for each group
    table_rows = ""
    for i, (division, group) in enumerate(grouped_data.items()):
        rows = "".join(
            "<tr>"
            + "".join(
                f"<td>{value}</td>" for key, value in row.items() if key != "division"
            )
            + "</tr>"
            for row in group
        )
        table_rows += f"<tr><td style='font-weight: bold' colspan='{len(data[0])}'>{division}</td></tr>{rows}"

        # add empty row
        if i < len(grouped_data) - 1:
            table_rows += "<tr></tr>"

    html_table = f"<table>{table_header}{table_rows}</table>"
    html_div += f"{html_table}</div>"
    return html_div


"""Extracts table data from pro football reference

Keyword arguments:
table_id -- HTML ID of table we are extracting
html -- HTML content we are parsing
Return: dictionary of NFL standings we parsed
"""


def extract_standings(table_id: str, html: str) -> List[Dict[str, Union[str, None]]]:
    soup = BeautifulSoup(html, "html.parser")

    standings_table = soup.find("table", {"id": table_id})

    if standings_table:
        # extract the standings table
        rows = standings_table.tbody.find_all(["tr", "td", "th"])

        # Create a list to store the standings
        standings = []

        current_division = None
        current_team = None

        for row in rows:
            data_stat = row.get("data-stat")
            if data_stat == "onecell":
                current_division = row.text.strip()
                current_team = None
            elif data_stat == "team":
                # This row has the team information
                current_team = {"team": row.text.strip(), "division": current_division}
                standings.append(current_team)
            elif (
                data_stat is not None
                and current_team is not None
                and (data_stat == "wins" or data_stat == "losses")
            ):
                current_team[data_stat] = row.text.strip()

        return standings
    else:
        print(f"Standings table with ID {table_id} can not be found.")


"""pretty print the standings

Keyword arguments:
standings -- List of the conference standings
Return: None
"""


def print_standings(standings: List[Dict[str, Union[str, None]]]) -> None:
    if standings:
        headers = standings[0].keys()
        rows = [team.values() for team in standings]

        print(tabulate(rows, headers=headers, tablefmt="pretty"))
    else:
        print("Standings not available.")


def save_html_to_file(html_content: str):
    with open("test.html", "w", encoding="utf-8") as file:
        file.write(html_content)


def read_html_from_file(file_path: str):
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            return file.read()
    except FileNotFoundError:
        abort(404)  # Return a 404 error if the file is not found
    except Exception as e:
        print(f"An error occurred while reading the file: {e}")
        abort(500)  # Return a 500 error for other exceptions


"""table data

column names (via data-stat attribute):
onecell -- division info
team: team name
wins: win total
losses: loss total
win_loss_perc:
points:
points_opp:
points_diff:
mov
sos_total
srs_total
srs_offense
srs_defense
"""


# if __name__ == "__main__":
#     app.run()
