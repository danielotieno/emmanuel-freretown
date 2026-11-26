import { describe, expect, it } from "vitest";
import { staffCookies } from "./auth";

describe("staffCookies", () => {
  it("makes every cookie __Host- on the https admin hosts: Secure, Path=/, no Domain", () => {
    for (const host of [
      "admin.ackemmanuelfreretown.org",
      "admin-staging.ackemmanuelfreretown.org",
    ]) {
      for (const cookie of Object.values(staffCookies(`https://${host}`))) {
        expect(cookie.name).toMatch(/^__Host-ack-staff\./);
        expect(cookie.attributes).toMatchObject({ secure: true, path: "/", httpOnly: true });
        expect(cookie.attributes).not.toHaveProperty("domain");
      }
    }
  });

  it("drops the prefix and Secure on loopback, where local builds run over http", () => {
    const cookies = staffCookies("http://admin.localhost:3000");
    expect(cookies.session_token?.name).toBe("ack-staff.session_token");
    expect(cookies.session_token?.attributes.secure).toBe(false);
  });

  it("covers the two-factor and trust-device cookies too", () => {
    const cookies = staffCookies("https://admin.ackemmanuelfreretown.org");
    expect(cookies.two_factor?.name).toBe("__Host-ack-staff.two_factor");
    expect(cookies.trust_device?.name).toBe("__Host-ack-staff.trust_device");
  });
});
