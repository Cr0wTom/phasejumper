/*
 * Copyright 2026 PhaseJumper contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AppHeader } from "./components/AppHeader";
import { NavBar } from "./components/NavBar";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { PlanScreen } from "./routes/plan/PlanScreen";
import { ShareOpen } from "./routes/plan/ShareOpen";
import { EvidenceScreen } from "./routes/settings/EvidenceScreen";
import { LegalScreen } from "./routes/settings/LegalScreen";
import { SettingsScreen } from "./routes/settings/SettingsScreen";
import { StartScreen } from "./routes/start/StartScreen";
import { TodayScreen } from "./routes/today/TodayScreen";
import { TripBuilder } from "./routes/trip/TripBuilder";
import { useRoute } from "./router";

export function App() {
  const route = useRoute();
  return (
    <div className="pj-shell">
      <AppHeader />
      <div className="pj-body">
        <NavBar route={route} />
        <div className="pj-page">
          {route.name === "start" ? (
            <StartScreen />
          ) : route.name === "settings" ? (
            <SettingsScreen />
          ) : route.name === "evidence" ? (
            <EvidenceScreen />
          ) : route.name === "legal" ? (
            <LegalScreen />
          ) : route.name === "plan" ? (
            <PlanScreen id={route.id} />
          ) : route.name === "today" ? (
            <TodayScreen />
          ) : route.name === "share" ? (
            <ShareOpen payload={route.payload} />
          ) : (
            <TripBuilder key={route.editId ?? "new"} editId={route.editId} />
          )}
        </div>
      </div>
      <UpdatePrompt />
    </div>
  );
}
