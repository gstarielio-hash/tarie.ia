import { StatusBar } from "expo-status-bar";

import { InspectorMobileApp } from "./src/features/InspectorMobileApp";

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <InspectorMobileApp />
    </>
  );
}
