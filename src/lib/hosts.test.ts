import { describe, expect, it } from "vitest";
import { adminOrigin, isAdminHost, isSecureCookieHost, publicOrigin } from "./hosts";

describe("isSecureCookieHost", () => {
  it("is secure on the public and staff hosts", () => {
    expect(isSecureCookieHost("ackemmanuelfreretown.org")).toBe(true);
    expect(isSecureCookieHost("admin.ackemmanuelfreretown.org")).toBe(true);
    expect(isSecureCookieHost("staging.ackemmanuelfreretown.org")).toBe(true);
  });

  it("is not secure on loopback hosts, with or without a port", () => {
    expect(isSecureCookieHost("localhost")).toBe(false);
    expect(isSecureCookieHost("localhost:3100")).toBe(false);
    expect(isSecureCookieHost("admin.localhost:3000")).toBe(false);
    expect(isSecureCookieHost("127.0.0.1:3000")).toBe(false);
    expect(isSecureCookieHost("[::1]:3000")).toBe(false);
    expect(isSecureCookieHost("LOCALHOST")).toBe(false);
  });

  it("fails safe to secure when the host is missing or only looks like localhost", () => {
    expect(isSecureCookieHost(null)).toBe(true);
    expect(isSecureCookieHost(undefined)).toBe(true);
    expect(isSecureCookieHost("")).toBe(true);
    expect(isSecureCookieHost("localhost.example.com")).toBe(true);
    expect(isSecureCookieHost("notlocalhost")).toBe(true);
  });
});

describe("isAdminHost", () => {
  it("matches the staff hosts exactly, with or without a port", () => {
    expect(isAdminHost("admin.ackemmanuelfreretown.org")).toBe(true);
    expect(isAdminHost("admin-staging.ackemmanuelfreretown.org")).toBe(true);
    expect(isAdminHost("admin.localhost:3000")).toBe(true);
    expect(isAdminHost("ADMIN.ackemmanuelfreretown.org")).toBe(true);
  });

  it("refuses the public hosts and look-alikes", () => {
    for (const host of [
      "ackemmanuelfreretown.org",
      "staging.ackemmanuelfreretown.org",
      "localhost:3000",
      "admin.ackemmanuelfreretown.org.example.com",
      "evil-admin.ackemmanuelfreretown.org",
      "",
      null,
      undefined,
    ]) {
      expect(isAdminHost(host)).toBe(false);
    }
  });
});

describe("adminOrigin", () => {
  it("is https on the real hosts and http on loopback", () => {
    expect(adminOrigin("admin.ackemmanuelfreretown.org")).toBe(
      "https://admin.ackemmanuelfreretown.org",
    );
    expect(adminOrigin("admin.localhost:3100")).toBe("http://admin.localhost:3100");
  });

  it("is null on any other host", () => {
    expect(adminOrigin("ackemmanuelfreretown.org")).toBeNull();
  });
});

describe("publicOrigin", () => {
  it("pairs each staff host with its public site", () => {
    expect(publicOrigin("admin.ackemmanuelfreretown.org")).toBe("https://ackemmanuelfreretown.org");
    expect(publicOrigin("ADMIN-STAGING.ackemmanuelfreretown.org")).toBe(
      "https://staging.ackemmanuelfreretown.org",
    );
    expect(publicOrigin("admin.localhost:3100")).toBe("http://localhost:3100");
  });

  it("is null on any other host", () => {
    for (const host of ["ackemmanuelfreretown.org", "localhost:3000", "evil.example", "", null]) {
      expect(publicOrigin(host)).toBeNull();
    }
  });
});
